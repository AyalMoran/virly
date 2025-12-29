#ifndef _ILRD_SCHED_H
#define _ILRD_SCHED_H

#include <stddef.h> /* 	size_t 		*/
#include <time.h>   /*	time_t		*/

#include "UID.h" /* 	irld_uid_t 	*/

typedef struct sched sched_t;

/**
 * @brief Creates a new empty scheduler.
 *
 * @return Pointer to the scheduler, or NULL if allocation failed.
 *
 * @complexity Time: O(1)  Space: O(1)
 */
sched_t* SchedCreate(void);

/**
 * @brief Destroys the scheduler and all tasks inside it.
 *
 * @param sched 	Pointer to the scheduler to destroy.
 *
 * @details Time: O(n)  Space: O(1)
 */
void SchedDestroy(sched_t* sched);

/**
 * @brief Adds a new task to the scheduler.
 *
 * @param sched             Pointer to the Scheduler to add the task to.
 * @param callback_func 	Function to run when task is executed.
 * @param cleanup_func 		Function to run when task is removed.
 * @param param             Parameter to pass to the task functions.
 * @param time_to_run 		When to run the task (in seconds since Epoch).
 *
 * @return Unique ID of the task, or UIDBadUID if failed.
 *
 * @note  complexity Time: O(n)  Space: O(1)
 */
ilrd_uid_t SchedAdd(sched_t* sched, int (*callback_func)(void* param),
                    void (*cleanup_func)(void* param), void* param,
                    time_t time_to_run);

/**
 * @brief Removes a task from the scheduler using its UID.
 *
 * @param sched 	Scheduler to remove the task from.
 * @param uid 		Unique ID of the task to remove.
 *
 * @return 0 on success, non-zero on failure.
 *
 * @complexity Time: O(n)  Space: O(1)
 */
int SchedRemove(sched_t* sched, ilrd_uid_t uid);

/**
 * @brief Runs the scheduler and executes tasks at their set times.
 *
 * @param sched Scheduler to run.
 *
 * @return 0 on success, non-zero error code on failure.
 *
 * @complexity Time: Depends on number of tasks. Roughly O(n). Worst case
 * O(n^2), if every task reschedules itself.
 */
int SchedRun(sched_t* sched);

/**
 * @brief Stops the scheduler from running.
 *
 * @param sched Scheduler to stop.
 *
 * @complexity Time: O(1)  Space: O(1)
 */
void SchedStop(sched_t* sched);

/**
 * @brief Returns the number of tasks in the scheduler.
 *
 * @param sched Scheduler to check.
 *
 * @return Number of tasks.
 *
 * @note Time: O(1)  Space: O(1)
 */
size_t SchedSize(const sched_t* sched);

/**
 * @brief Checks if the scheduler is empty.
 *
 * @param sched Scheduler to check.
 *
 * @return 1 if empty, 0 otherwise.
 *
 * @complexity Time: O(1)  Space: O(1)
 */
int SchedIsEmpty(const sched_t* sched);

/**
 * @brief Removes all tasks from the scheduler.
 *
 * @param sched Scheduler to clear.
 *
 * @complexity Time: O(n)  Space: O(1)
 */
void SchedClear(sched_t* sched);

#endif /* _ILRD_SCHED_H */
