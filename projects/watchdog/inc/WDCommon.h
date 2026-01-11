 /**************************************************************
 * File    : WDCommon.h
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/
#ifndef __ILRD_WD_COMMON_H__
#define __ILRD_WD_COMMON_H__

#include <semaphore.h> /* sem_t             */
#include <signal.h>    /* sig_atomic_t      */
#include <time.h>      /* time_t            */

#include "Scheduler.h" /* sched_t           */
#include "Watchdog.h"  /* wd_args_t         */

extern volatile sig_atomic_t is_alive;
extern volatile sig_atomic_t should_shutdown;

typedef struct wd_args
{
    sem_t user_sem;
    sem_t* dog_gate;
    size_t interval;
    size_t misses_threshold;
    pid_t pid;
    sched_t* heart;
    char** exec_argv;
    char interval_str[32];
    char misses_str[32];
} wd_args_t;

extern wd_args_t* g_wd_args;

wd_status_t WDCommonInstallHandlers(void);

wd_status_t WDCommonInitHeartBeat(wd_args_t* args,
                                  int (*check_task)(void*),
                                  int (*signal_task)(void*),
                                  time_t start_time);

wd_status_t WDCommonStartBeating(sched_t* wd_args);

wd_status_t WDSemWaitLoop(sem_t* s);

#endif /* __ILRD_WD_COMMON_H__ */


