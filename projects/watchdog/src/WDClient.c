
/**************************************************************
 * File    : Watchdog.c
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

/*============================ INCLUDES ============================*/
#define _POSIX_C_SOURCE 200809L

#include <assert.h>    /* assert    */
#include <fcntl.h>     /* O_* constants */
#include <pthread.h>   /* pthread_t */
#include <semaphore.h> /* sem_t     */
#include <stddef.h>    /* size_t    */
#include <stdio.h>     /* snprintf  */
#include <stdlib.h>    /* malloc    */
#include <string.h>    /* memset    */
#include <unistd.h>    /* write     */
#include <signal.h>    /* sig_atomic_t */
#include <sys/types.h> /* pid_t */
#include <errno.h>     /* errno     */

#include "Scheduler.h"
#include "Watchdog.h"
#include "WDDebug.h"
/*========================== DEFINITIONS ===========================*/
#define ALIVE (1)
#define DEAD (0)
#define TRUE (1)
#define FALSE (0)
/*========================== MACRO UTILS ===========================*/
/*========================= TYPEDEFS/ENUMS =========================*/
typedef void* (*thread_routine_t)(void* args);

volatile sig_atomic_t is_alive = FALSE;
volatile sig_atomic_t should_shutdown = FALSE;
static wd_args_t* g_wd_args = NULL;


/*====================== STATIC DECLARATIONS =======================*/


static wd_status_t Init(wd_args_t** args, int argc, char* argv[]);
static wd_status_t InitSemaphores(wd_args_t* args);
static wd_status_t ExtractArgs(wd_args_t* args, int argc, char* argv[]);
static wd_status_t InitHeartBeat(wd_args_t* args);

static int WDCheckTask(void* args);
static int WDSignalTask(void* args);

static void HandleSIGUSR1(int sig);
static void HandleSIGUSR2(int sig);
static wd_status_t InstallHandlers(void);

static wd_status_t Destroy(wd_args_t* args);
static wd_status_t StartBeating(sched_t* heart);
static wd_status_t SemWaitLoop(sem_t* s);
/*========================= API FUNCTIONS ==========================*/
int main(int argc, char* argv[])
{
    wd_status_t status = WD_SUCCESS;
    wd_args_t* args = NULL;
    
    status = Init(&args, argc, argv);
    if (WD_SUCCESS != status)
    {
        return (int) status;
    }
    
    WD_DBG_PRINT( "Posting to dog_gate...\n");
    if(-1 == sem_post(args->dog_gate))
    {
        perror("sem_post() -> Watchdog Gate failed:");
        status = Destroy(args);
        return (int) status;
    }


    WD_DBG_PRINT( "Starting beating...\n");
    status = StartBeating(args->heart);
    if (WD_SUCCESS != status)
    {
        return (int) status;
    }

    if(should_shutdown)
    {
        status = Destroy(args);
        if (WD_SUCCESS != status)
        {
            return (int) status;
        }
    }

    return (int) status;
}

static wd_status_t Init(wd_args_t** args, int argc, char* argv[])
{
    wd_status_t status = WD_SUCCESS;

    assert(NULL != argv);
    assert(NULL != args);

    (*args) = (wd_args_t*)malloc(sizeof(wd_args_t));
    if (NULL == (*args))
    {
        return WD_ALLOC_ERROR;
    }

    status = ExtractArgs(*args, argc, argv);
    if (WD_SUCCESS != status)
    {
        free(*args);
        *args = NULL;
        return status;
    }

    status = InitSemaphores(*args);
    if (WD_SUCCESS != status)
    {
        Destroy(*args);
        *args = NULL;
        return status;
    }

    status = InitHeartBeat(*args);
    if (WD_SUCCESS != status)
    {
        Destroy(*args);
        *args = NULL;
        return status;
    }

    status = InstallHandlers();
    if (WD_SUCCESS != status)
    {
        Destroy(*args);
        *args = NULL;
        return status;
    }

    g_wd_args = *args;
    PRINT_ARGS(WD_DEBUG, *args);

    return status;
}

static wd_status_t InitSemaphores(wd_args_t* args)
{
    assert(NULL != args);

    args->dog_gate = sem_open(WATCHDOG_GATE, O_CREAT, 0600, 0);
    if (SEM_FAILED == args->dog_gate)
    {
        perror("sem_open() -> dog_gate failed in WDClient.c:");
        return WD_SEM_ERROR;
    }
    return WD_SUCCESS;
}

static wd_status_t ExtractArgs(wd_args_t* args, int argc, char* argv[])
{
    int i = 0;

    assert(NULL != args);
    assert(argc > 2);
    assert(NULL != argv);

    args->interval = atoi(argv[argc - 2]);
    args->misses_threshold = atoi(argv[argc - 1]);
    args->pid = getppid();

    args->exec_argv = (char**)malloc((argc - 2) * sizeof(char*));
    if (NULL == args->exec_argv)
    {
        return WD_ALLOC_ERROR;
    }

    for (i = 0; i < argc - 2; i++)
    {
        args->exec_argv[i] = argv[i];
    }
    args->exec_argv[argc - 2] = NULL;

    return WD_SUCCESS;
}


static wd_status_t InitHeartBeat(wd_args_t* args)
{
    ilrd_uid_t check_uid = UIDBadUID;
    ilrd_uid_t signal_uid = UIDBadUID;

    
    args->heart = SchedCreate();
    if (NULL == args->heart)
    {
        return WD_ALLOC_ERROR;
    }
    
    check_uid = SchedAdd(args->heart, WDCheckTask, NULL, args, time(NULL) + 1);
    if (UIDIsSame(check_uid, UIDBadUID))
    {
        SchedDestroy(args->heart);

        return WD_ALLOC_ERROR;
    }

    signal_uid = SchedAdd(args->heart, WDSignalTask, NULL, args, time(NULL) + 1);
    if (UIDIsSame(signal_uid, UIDBadUID))
    {
        SchedDestroy(args->heart);

        return WD_ALLOC_ERROR;
    }

    return WD_SUCCESS;
}


static wd_status_t ReviveUserProcess(wd_args_t* args)
{
    pid_t pid = 0;
    size_t i = 0;
    assert(NULL != args);
    assert(NULL != args->exec_argv);

    pid = fork();
    if (0 > pid)
    {
        sem_post(args->dog_gate);
        perror("fork() failed:");
        return WD_FORK_ERROR;
    }
    else if (0 == pid)
    {
        WD_DBG_PRINT( "Executing user process with args: %s\n", args->exec_argv[0]);
        for (i = 0; NULL != args->exec_argv[i]; ++i)
        {
            WD_DBG_PRINT( "args[%lu]: %s\n", i, args->exec_argv[i]);
        }
        execvp(args->exec_argv[1], &args->exec_argv[1]);
        perror("execv() failed in WDClient.c:");
        sem_post(args->dog_gate);
        return WD_EXEC_ERROR;
    }
    return WD_SUCCESS;
}

static wd_status_t Destroy(wd_args_t* args)
{
    assert(NULL != args);

    if(-1 == sem_close(args->dog_gate))
    {
        perror("sem_close() -> Watchdog Gate failed:");
        return WD_SEM_ERROR;
    }

    if(-1 == sem_unlink(WATCHDOG_GATE))
    {
        perror("sem_unlink() -> Watchdog Gate failed:");
        return WD_SEM_ERROR;
    }
    args->dog_gate = NULL;

    if(NULL != args->exec_argv)
    {
        free(args->exec_argv);
        args->exec_argv = NULL;
    }

    if(NULL != args->heart)
    {
        SchedDestroy(args->heart);
        args->heart = NULL;
    }

    free(args);
    args = NULL;

    return WD_SUCCESS;
}

static wd_status_t StartBeating(sched_t* heart)
{
    sched_status_t status = SCHED_SUCCESS;

    assert(NULL != heart);

    if (SCHED_SUCCESS != (status = SchedRun(heart)))
    {
        WD_DBG_PRINT( "SchedRun(heart) failed in WDClient.c:\n");
        switch (status)
        {
            case SCHED_INVALID_TASK:
                return WD_SCHED_INVALID_TASK;
            case SCHED_ENQUEUE_FAIL:
                return WD_SCHED_ENQUEUE_ERROR;
            default:
                return WD_SCHED_ERROR;
        }
    }
    return WD_SUCCESS;
}

static int WDCheckTask(void* args)
{
    static size_t misses_count = 0;
    wd_args_t* wd_args = (wd_args_t*) args;
    int interval = 0;

    assert(NULL != wd_args);

    interval = (int) wd_args->interval;

    if (TRUE == is_alive)
    {
        WD_DBG_PRINT("heartbeat is alive!\n");
        misses_count = 0;
        is_alive = FALSE;
    }
    else
    {
        WD_DBG_PRINT(COLOR_RED  "heartbeat is unresponsive...\n" COLOR_END);
        ++misses_count;
        WD_DBG_PRINT(COLOR_RED  "Misses count: %zu\n" COLOR_END, misses_count);
        if (misses_count > wd_args->misses_threshold)
        {
            WD_DBG_PRINT(COLOR_RED "======REVIVING USER PROCESS=====");
            kill(wd_args->pid, SIGUSR2);
            is_alive = FALSE;
            (void) ReviveUserProcess(wd_args);
            kill(0, SIGUSR2);
            
        }
    }
    return interval;
}

static int WDSignalTask(void* args)
{
    wd_args_t* wd_args = (wd_args_t*) args;

    assert(NULL != wd_args);
    
    WD_DBG_PRINT(  "SIGUSR1 → heartbeat\n");

    kill(wd_args->pid, SIGUSR1);
    return (int) wd_args->interval;
}

static void HandleSIGUSR1(int sig)
{
    (void) sig;
    is_alive = ALIVE;
}

static void HandleSIGUSR2(int sig)
{
    (void) sig;
    assert(g_wd_args);
    assert(g_wd_args->heart);

    should_shutdown = TRUE;
    
    if (g_wd_args && g_wd_args->heart)
    {
        SchedStop(g_wd_args->heart);
    }
}

static wd_status_t InstallHandlers(void)
{
    struct sigaction sa = {0};
    
    sa.sa_handler = HandleSIGUSR1;
    sa.sa_flags = SA_RESTART;
    sigemptyset(&sa.sa_mask);

    if (0 != sigaction(SIGUSR1, &sa, NULL))
    {
        perror("sigaction(SIGUSR1) failed:");
        return WD_SIGNAL_ERROR;
    }

    sa.sa_handler = HandleSIGUSR2;
    sa.sa_flags = SA_RESTART;
    sigemptyset(&sa.sa_mask);

    if (0 != sigaction(SIGUSR2, &sa, NULL))
    {
        perror("sigaction(SIGUSR2) failed:");
        return WD_SIGNAL_ERROR;
    }

    return WD_SUCCESS;
}


static wd_status_t SemWaitLoop(sem_t* s)
{
    WD_DBG_PRINT( COLOR_BRI COLOR_YEL "sem_wait loop\n" COLOR_END);
    while (-1 == sem_wait(s))
    {
        WD_DBG_PRINT( "sem_wait(s) failed in Watchdog.c:\n");
        if (EINTR != errno)
        {
            return WD_SEM_ERROR;
        }
    }
    WD_DBG_PRINT( COLOR_BRI COLOR_YEL "sem_wait loop done\n" COLOR_END);
    return WD_SUCCESS;
}