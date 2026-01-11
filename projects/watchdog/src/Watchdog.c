
/**************************************************************
 * File    : Watchdog.c
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

/*============================ INCLUDES ============================*/
#define _POSIX_C_SOURCE 200809L

#include <assert.h>    /* assert                */
#include <errno.h>     /* errno                 */
#include <fcntl.h>     /* O_CREAT               */
#include <pthread.h>   /* pthread_t             */
#include <semaphore.h> /* sem_t                 */
#include <signal.h>    /* SIGUSR2               */
#include <stddef.h>    /* size_t                */
#include <stdio.h>     /* snprintf              */
#include <stdlib.h>    /* malloc                */
#include <sys/types.h> /* pid_t                 */
#include <sys/wait.h>  /* waitpid               */
#include <unistd.h>    /* fork                  */
#include "Scheduler.h" /* sched_t               */
#include "WDCommon.h"  /* WDCommonInitHeartBeat */
#include "WDDebug.h"   /* PRINT_ARGS            */
#include "Watchdog.h"  /* wd_args_t             */

/*========================== DEFINITIONS ===========================*/
/*========================== MACRO UTILS ===========================*/
#define ALIVE (1)
#define DEAD (0)
#define TRUE (1)
#define FALSE (0)

/*========================= TYPEDEFS/ENUMS =========================*/
typedef void* (*thread_routine_t)(void* args);

/*====================== STATIC DECLARATIONS =======================*/
static wd_status_t CreateThread(pthread_t* thread, thread_routine_t func,
                                void* arg);
static void* HeartBeatFunc(void* param);
static wd_status_t Init(wd_args_t** args, size_t interval,
                        size_t misses_threshold, char* argv[]);
static wd_status_t ReviveWD(wd_args_t* args);

static size_t CountArgv(char* argv[]);
static wd_status_t BuildExecArgv(wd_args_t* args, size_t interval,
                                 size_t misses_threshold, char* argv[]);

static int WDCheckTask(void* args);
static int WDSignalTask(void* args);

static wd_status_t Destroy(wd_args_t* args);
/*========================= API FUNCTIONS ==========================*/

wd_status_t WatchdogStart(size_t interval, size_t misses_threshold,
                          char* argv[])
{
    wd_status_t status = WD_SUCCESS;
    pthread_t thr_heartbeat = {0};
    wd_args_t* wd_args = NULL;

    assert(argv);

    status = Init(&wd_args, interval, misses_threshold, argv);
    if (WD_SUCCESS != status)
    {
        MAIN_DBG_PRINT("Init() failed in Watchdog.c:\n");
        return status;
    }

    status = CreateThread(&thr_heartbeat, HeartBeatFunc, wd_args);
    if (WD_SUCCESS != status)
    {
        MAIN_DBG_PRINT("CreateThread(): failed in Watchdog.c:\n");

        return status;
    }

    status = WDSemWaitLoop(&wd_args->user_sem);
    if (WD_SUCCESS != status)
    {
        return status;
    }

    return status;
}

void WatchdogStop()
{
    assert(g_wd_args);
    assert(g_wd_args->pid);

    kill(g_wd_args->pid, SIGUSR2);
    return;
}
/*======================= STATIC FUNCTIONS ========================*/

static wd_status_t CreateThread(pthread_t* thread, thread_routine_t func,
                                void* arg)
{
    pthread_attr_t attr = {0};
    pthread_attr_init(&attr);
    pthread_attr_setdetachstate(&attr, PTHREAD_CREATE_DETACHED);

    assert(func);
    assert(thread);

    if (0 != pthread_create(thread, &attr, func, arg))
    {
        return WD_THREAD_ERROR;
    }

    pthread_attr_destroy(&attr);

    return WD_SUCCESS;
}

static void* HeartBeatFunc(void* param)
{
    wd_status_t status = WD_SUCCESS;
    wd_args_t* args = (wd_args_t*) param;
    sem_t* dog_gate = NULL;
    sem_t* user_sem = NULL;

    assert(param);

    dog_gate = args->dog_gate;
    user_sem = &args->user_sem;

    status = WDCommonInitHeartBeat(args, WDCheckTask, WDSignalTask, time(NULL));
    if (WD_SUCCESS != status)
    {
        return (void*) status;
    }

    status = ReviveWD(args);
    if (WD_SUCCESS != status)
    {
        return (void*) status;
    }

    g_wd_args = args;
    PRINT_ARGS(HB_DEBUG, args);
    HB_DBG_PRINT("Waiting for dog_gate...\n");
    status = WDSemWaitLoop(dog_gate);

    if (WD_SUCCESS != status)
    {
        HB_DBG_PRINT("SemWaitLoop(dog_gate) failed in Watchdog.c:\n");
        return (void*) status;
    }
    HB_DBG_PRINT("dog_gate acquired\n");
    HB_DBG_PRINT("Posting to user_sem...\n");
    sem_post(user_sem);
    HB_DBG_PRINT("user_sem posted\n");

    (void) WDCommonStartBeating(args->heart);

    if (should_shutdown)
    {
        Destroy(args);
        exit(EXIT_SUCCESS);
    }

    (void) args;
    return 0;
}

static wd_status_t Init(wd_args_t** args, size_t interval,
                        size_t misses_threshold, char* argv[])
{
    wd_status_t status = WD_SUCCESS;

    MAIN_DBG_PRINT("Init() called in Watchdog.c:\n");

    *args = (wd_args_t*) malloc(sizeof(wd_args_t));
    if (NULL == *args)
    {
        MAIN_DBG_PRINT("malloc() failed in Watchdog.c:\n");
        return WD_ALLOC_ERROR;
    }

    (*args)->interval = interval;
    (*args)->misses_threshold = misses_threshold;

    status = BuildExecArgv(*args, interval, misses_threshold, argv);
    if (WD_SUCCESS != status)
    {
        free(*args);
        return status;
    }

    sem_unlink(WATCHDOG_GATE);
    (*args)->dog_gate = sem_open(WATCHDOG_GATE, O_CREAT, 0777, 0);
    if (SEM_FAILED == (*args)->dog_gate)
    {
        perror("sem_open() -> dog_gate failed in Watchdog.c:");
        free((*args)->exec_argv);
        free(*args);
        return WD_SEM_ERROR;
    }

    if (-1 == sem_init(&(*args)->user_sem, 0, 0))
    {
        perror("sem_init((*args)->user_sem) failed in Watchdog.c:");
        free((*args)->exec_argv);
        free(*args);
        return WD_SEM_ERROR;
    }

    status = WDCommonInstallHandlers();
    if (WD_SUCCESS != status)
    {
        free((*args)->exec_argv);
        free(*args);
        return status;
    }

    return WD_SUCCESS;
}

static size_t CountArgv(char* argv[])
{
    size_t count = 0;

    if (NULL == argv)
    {
        return 0;
    }

    while (NULL != argv[count])
    {
        ++count;
    }

    return count;
}

static wd_status_t BuildExecArgv(wd_args_t* args, size_t interval,
                                 size_t misses_threshold, char* argv[])
{
    size_t argc = 0;
    size_t i = 0;
    int snprintf_ret = 0;

    assert(NULL != args);

    argc = CountArgv(argv);

    args->exec_argv = (char**) malloc((argc + 4) * sizeof(char*));
    if (NULL == args->exec_argv)
    {
        return WD_ALLOC_ERROR;
    }

    args->exec_argv[0] = (char*) WD_EXEC_PATH;

    for (i = 0; i < argc; ++i)
    {
        args->exec_argv[i + 1] = argv[i];
    }

    snprintf_ret = snprintf(args->interval_str, sizeof(args->interval_str),
                            "%lu", interval);
    if (snprintf_ret < 0 || (size_t) snprintf_ret >= sizeof(args->interval_str))
    {
        perror("snprintf failed:");
        free(args->exec_argv);
        return WD_SNPRINTF_FAIL;
    }
    args->exec_argv[argc + 1] = args->interval_str;

    snprintf_ret = snprintf(args->misses_str, sizeof(args->misses_str), "%lu",
                            misses_threshold);
    if (snprintf_ret < 0 || (size_t) snprintf_ret >= sizeof(args->misses_str))
    {
        perror("snprintf failed:");

        free(args->exec_argv);
        return WD_SNPRINTF_FAIL;
    }
    args->exec_argv[argc + 2] = args->misses_str;

    args->exec_argv[argc + 3] = NULL;

    return WD_SUCCESS;
}

static wd_status_t ReviveWD(wd_args_t* args)
{
    pid_t pid = 0;
    size_t i = 0;
    assert(NULL != args);
    assert(NULL != args->exec_argv);

    pid = fork();
    if (0 > pid)
    {
        perror("fork() failed:");
        return WD_FORK_ERROR;
    }
    else if (0 == pid)
    {
        HB_DBG_PRINT("Executing WDClient with args: %s\n", args->exec_argv[0]);
        for (i = 0; i < CountArgv(args->exec_argv); ++i)
        {
            HB_DBG_PRINT("args[%zu]: %s\n", i, args->exec_argv[i]);
        }
        execv(WD_EXEC_PATH, args->exec_argv);
        perror("execv() failed:");
        return WD_EXEC_ERROR;
    }

    args->pid = pid;

    return WD_SUCCESS;
}

static wd_status_t Destroy(wd_args_t* args)
{
    assert(NULL != args);

    sem_close(args->dog_gate);
    sem_unlink(WATCHDOG_GATE);
    sem_destroy(&args->user_sem);
    args->dog_gate = NULL;

    free(args->exec_argv);
    args->exec_argv = NULL;

    SchedDestroy(args->heart);
    args->heart = NULL;

    free(args);
    args = NULL;

    return WD_SUCCESS;
}

static int WDCheckTask(void* args)
{
    static size_t misses_count = 0;
    wd_args_t* wd_args = (wd_args_t*) args;
    int interval = 0;
    wd_status_t status = WD_SUCCESS;

    assert(NULL != wd_args);

    interval = (int) wd_args->interval;

    if (TRUE == is_alive)
    {
        HB_DBG_PRINT("WD is alive!\n");
        misses_count = 0;
        is_alive = FALSE;
    }
    else
    {
        HB_DBG_PRINT(COLOR_RED "WD is unresponsive...\n");
        ++misses_count;
        HB_DBG_PRINT("Misses count: %zu\n", misses_count);
        if (misses_count > wd_args->misses_threshold)
        {
            HB_DBG_PRINT(COLOR_RED "======REVIVING WD======");
            kill(wd_args->pid, SIGUSR2);
            waitpid(wd_args->pid, NULL, WUNTRACED);
            is_alive = FALSE;
            misses_count = 0;
            if (WD_SUCCESS != ReviveWD(wd_args))
            {
                kill(0, SIGUSR2);
            }
            status = WDSemWaitLoop(wd_args->dog_gate);
            if (WD_SUCCESS != status)
            {
                return status;
            }
        }
    }
    return interval;
}

static int WDSignalTask(void* args)
{
    wd_args_t* wd_args = (wd_args_t*) args;
    assert(NULL != wd_args);

    HB_DBG_PRINT("SIGUSR1 -> watchdog\n");

    kill(wd_args->pid, SIGUSR1);
    return (int) wd_args->interval;
}

/* handlers and sem-wait loop are now shared in WDCommon.c */