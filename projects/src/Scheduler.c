#include <assert.h> /*	assert		*/
#include <stdlib.h> /*	malloc		*/
#include <time.h>   /*	time_t		*/
#include <unistd.h> /*	sleep		*/

#include "PQ.h"        /*	pq_t		*/
#include "Scheduler.h" /*	sched_t		*/
#include "Task.h"      /*	task_t		*/
#include "UID.h"       /*	ilrd_uid_t	*/

#define SCHED_IMMEDIATE ((time_t) 0)
#define INVALID_TIME ((time_t) (-1))
#define SCHED_RUNNING (1)
#define SCHED_STOPPED (0)

static int SchedCmp(const void* task1, const void* task2);
static int FindUID(const void* data, void* param);
/* static int TaskShouldBeExecutedNow(time_t time_to_run);
 */
static int TaskWasNotRemovedFromCallback(task_t* task);
static void SchedStopAndReset(sched_t* sched);
static void SchedSleep(task_t* task);

struct sched
{
    pq_t* pq;
    task_t* curr_task;
    int is_running;
};

enum
{
    SCHED_SUCCESS = 0,
    SCHED_INVALID_TASK,
    SCHED_ENQUEUE_FAIL,
    SCHED_FAIL

};

sched_t* SchedCreate(void)
{
    sched_t* sched = NULL;

    sched = (sched_t*) malloc(sizeof(sched_t));
    if (NULL == sched)
    {
        return NULL;
    }

    sched->pq = PQCreate(SchedCmp);
    if (NULL == sched->pq)
    {
        free(sched);
        return NULL;
    }

    sched->curr_task = NULL;
    sched->is_running = 0;

    return sched;
}

void SchedDestroy(sched_t* sched)
{
    assert(sched);

    SchedClear(sched);
    PQDestroy(sched->pq);

    free(sched);
}

ilrd_uid_t SchedAdd(sched_t* sched, int (*callback_func)(void* param),
                    void (*cleanup_func)(void* param), void* param,
                    time_t time_to_run)
{
    task_t* task = NULL;

    assert(sched);
    assert(callback_func);

    assert(time_to_run != (time_t) (-1));

    task = TaskCreate(callback_func, cleanup_func, param, time_to_run);

    if (NULL == task || UIDIsSame(UIDBadUID, TaskGetUID(task)))
    {
        return UIDBadUID;
    }

    if (PQEnqueue(sched->pq, task))
    {
        TaskDestroy(task);
        return UIDBadUID;
    }

    return TaskGetUID(task);
}

int SchedRemove(sched_t* sched, ilrd_uid_t uid)
{
    task_t* task = NULL;
    
    assert(sched);

    if (sched->curr_task && UIDIsSame(TaskGetUID(sched->curr_task), uid))
    {
        TaskDestroy(sched->curr_task);
        sched->curr_task = NULL;
        return SCHED_SUCCESS;
    }

    if (!PQIsEmpty(sched->pq))
    {
        if (NULL != (task = PQErase(sched->pq, FindUID, &uid)))
        {
            TaskDestroy(task);
            return SCHED_SUCCESS;
        }
    }

    return SCHED_FAIL;
}

int SchedRun(sched_t* sched)
{
    task_t* task_to_execute = NULL;
    size_t task_interval = 0;
    time_t time_to_run = 0;

    assert(sched);

    sched->is_running = SCHED_RUNNING;

    while (sched->is_running && !SchedIsEmpty(sched))
    {
        task_to_execute = (task_t*) PQDequeue(sched->pq);
        sched->curr_task = task_to_execute;
        time_to_run = TaskGetTime(sched->curr_task);

        if (NULL == task_to_execute || INVALID_TIME == time_to_run)
        {
            SchedStopAndReset(sched);
            return SCHED_INVALID_TASK;
        }

        SchedSleep(task_to_execute);
        task_interval = TaskRun(task_to_execute);

        if (TaskWasNotRemovedFromCallback(sched->curr_task))
        {
            if (0 < task_interval)
            {
                TaskSetTime(task_to_execute,
                            time(NULL) + (time_t) task_interval);
                if (0 != PQEnqueue(sched->pq, task_to_execute))
                {
                    TaskDestroy(task_to_execute);
                    SchedStopAndReset(sched);

                    return SCHED_ENQUEUE_FAIL;
                }
            }
            else
            {
                TaskDestroy(task_to_execute);
            }
        }
        sched->curr_task = NULL;
    }

    sched->is_running = SCHED_STOPPED;

    return SCHED_SUCCESS;
}

void SchedStop(sched_t* sched)
{
    assert(sched);
    assert(sched->pq);

    sched->is_running = 0;
}

size_t SchedSize(const sched_t* sched)
{
    assert(sched);
    assert(sched->pq);

    return PQSize(sched->pq);
}

int SchedIsEmpty(const sched_t* sched)
{
    assert(sched);
    assert(sched->pq);

    return PQIsEmpty(sched->pq);
}

void SchedClear(sched_t* sched)
{
    assert(sched);
    assert(sched->pq);

    while (!SchedIsEmpty(sched))
    {
        TaskDestroy((task_t*) PQDequeue(sched->pq));
    }

    if (sched->curr_task)
    {
        TaskDestroy(sched->curr_task);
    }
    sched->curr_task = NULL;
}

/*****************STATIC DEFINITIONS************************** */
static int SchedCmp(const void* task1, const void* task2)
{
    time_t time1 = 0;
    time_t time2 = 0;

    assert(task1);
    assert(task2);

    time1 = TaskGetTime((const task_t*) task1);
    time2 = TaskGetTime((const task_t*) task2);

    if (SCHED_IMMEDIATE == time1 && SCHED_IMMEDIATE == time2)
    {
        return 0;
    }
    else if (SCHED_IMMEDIATE == time1 || time1 < time2)
    {
        return 1;
    }
    else if (SCHED_IMMEDIATE == time2 || time1 > time2)
    {
        return -1;
    }

    return 0;
}

static int FindUID(const void* data, void* param)
{
    task_t* task = (task_t*) data;
    ilrd_uid_t* uid = (ilrd_uid_t*) param;

    if (UIDIsSame(TaskGetUID(task), *uid))
    {
        return 1;
    }

    return 0;
}

static int TaskWasNotRemovedFromCallback(task_t* task)
{
    return (NULL != task);
}

/* static int TaskShouldBeExecutedNow(time_t time_to_run)
{
    if (time_to_run <= time(NULL))
    {
        return 1;
    }

    return 0;
} */

static void SchedSleep(task_t* task)
{
    time_t current_time = time(NULL);
    time_t time_to_run = 0;
    unsigned int to_sleep = 0;

    assert(task);

    time_to_run = TaskGetTime(task);

    while (time_to_run > current_time)
    {
        to_sleep = (unsigned int) (time_to_run - current_time);
        to_sleep = sleep(to_sleep);

        if (0 != to_sleep)
        {
            continue;
        }

        current_time = time(NULL);
    }
}

static void SchedStopAndReset(sched_t* sched)
{
    sched->is_running = SCHED_STOPPED;
    sched->curr_task = NULL;
}
