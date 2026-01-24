
/**************************************************************
 * File    : WDCommon.c
 * Author  : Ayal Moran
 * Reviewer: Chaya T.
 * Date    : 10-1-2026
 **************************************************************/

/*============================ INCLUDES ============================*/
#define _POSIX_C_SOURCE 200809L

#include <assert.h>    /* assert    */
#include <errno.h>     /* errno     */
#include <semaphore.h> /* sem_t     */
#include <signal.h>    /* sigaction */
#include <stdio.h>     /* perror    */

#include "Watchdog.h" /* sched_t, SchedRun, SchedStop */
#include "WDCommon.h"

/*========================== DEFINITIONS ===========================*/
#define DEAD (0)
#define ALIVE (1)

#define FALSE (0)
#define TRUE (1)
/*========================= TYPEDEFS/ENUMS =========================*/

/*========================== GLOBAL STATE ==========================*/
volatile sig_atomic_t is_alive = DEAD;
volatile sig_atomic_t should_shutdown = FALSE;
wd_args_t* g_wd_args = NULL;

/*====================== STATIC DECLARATIONS =======================*/
static void HandleSIGUSR1(int sig);
static void HandleSIGUSR2(int sig);

/*========================= API FUNCTIONS ==========================*/

wd_status_t WDCommonInstallHandlers(void)
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

wd_status_t WDCommonInitHeartBeat(wd_args_t* args,
                                  int (*check_task)(void*),
                                  int (*signal_task)(void*),
                                  time_t start_time)
{
    ilrd_uid_t check_uid = UIDBadUID;
    ilrd_uid_t signal_uid = UIDBadUID;

    assert(NULL != args);
    assert(NULL != check_task);
    assert(NULL != signal_task);

    args->heart = SchedCreate();
    if (NULL == args->heart)
    {
        return WD_ALLOC_ERROR;
    }

    check_uid =
        SchedAdd(args->heart, check_task, NULL, args, start_time);
    if (UIDIsSame(check_uid, UIDBadUID))
    {
        SchedDestroy(args->heart);

        return WD_ALLOC_ERROR;
    }

    signal_uid =
        SchedAdd(args->heart, signal_task, NULL, args, start_time);
    if (UIDIsSame(signal_uid, UIDBadUID))
    {
        SchedDestroy(args->heart);

        return WD_ALLOC_ERROR;
    }

    return WD_SUCCESS;
}

wd_status_t WDCommonStartBeating(sched_t* heart)
{
    sched_status_t status = SCHED_SUCCESS;

    assert(NULL != heart);

    if (SCHED_SUCCESS != (status = SchedRun(heart)))
    {
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

wd_status_t WDSemWaitLoop(sem_t* s)
{
    while (-1 == sem_wait(s))
    {
        if (EINTR != errno)
        {
            return WD_SEM_ERROR;
        }
    }
    return WD_SUCCESS;
}

/*======================= STATIC FUNCTIONS ========================*/

static void HandleSIGUSR1(int sig)
{
    (void) sig;
    is_alive = ALIVE;
}

static void HandleSIGUSR2(int sig)
{
    (void) sig;

    should_shutdown = TRUE;

    if (g_wd_args && g_wd_args->heart)
    {
        SchedStop(g_wd_args->heart);
    }
}


