
/**************************************************************
 * File    : Watchdog.h
 * Author  : Ayal Moran
 * Reviewer: Chaya T.
 * Date    : 10-1-2026
 **************************************************************/

#ifndef __ILRD_WATCHDOG_H__
#define __ILRD_WATCHDOG_H__

#include <stddef.h> /* size_t */
#include <semaphore.h> /* sem_t */
#include <sys/types.h> /* pid_t */

/*#include "Scheduler.h"*/ /* sched_t */

#define WATCHDOG_GATE ("/wd_gate")

#define WD_EXEC_PATH ("./bin/wd_client") /*TODO: change to the actual path*/

typedef enum wd_status
{
    WD_SUCCESS = 0,
    WD_START_ERROR,
    WD_FORK_ERROR,
    WD_EXEC_ERROR,
    WD_THREAD_ERROR,
    WD_SEM_ERROR,
    WD_SCHED_ERROR,
    WD_ALLOC_ERROR,
    WD_SIGNAL_ERROR,
    WD_SCHED_INVALID_TASK,
    WD_SCHED_ENQUEUE_ERROR,
    WD_SNPRINTF_FAIL
} wd_status_t;

wd_status_t WatchdogStart (size_t interval, size_t misses_threshold, char* argv[]);

void WatchdogStop();

#endif /* __ILRD_WATCHDOG_H__ */