/******************
 Author : Ayal Moran
 Reviewer:
 Date: 23.4.25
 *****************/
#ifndef _ILRD_TASK_H
#define _ILRD_TASK_H

#include <stddef.h> /* size_t 		*/
#include <UID.h>	/* ilrd_uid_t 	*/
#include <time.h>   /* time_t 		*/

typedef struct task task_t;

/**
 * @brief Creates a new empty priority queue.
 *
 * @param cmp_func  User defined comparison—
 *                  positive if `data1` is higher priority than `data2`,
 *                  zero     if priorities are equal,  
 *                  negative if `data1` is lower  priority than `data2`.
 *					
 *			  		-- FIFO stability is guaranteed, 
 *				 	   so FIFO order is preserved for equality.
 * 
 * @return Pointer to the new queue on success, `NULL` on allocation failure.
 *
 * @complexity Time: O(1)  Space: O(1)
 */
task_t* TaskCreate(int (*callback_func)(void* param),void (*cleanup_func)(void* param),  void* param, time_t time_to_run);

void TaskDestroy(task_t* task);

int TaskRun(task_t* task);

ilrd_uid_t TaskGetUID(const task_t* task);

size_t TaskGetInterval(const task_t* task);

time_t TaskGetTime(const task_t* task);

void TaskSetTime(task_t* task, time_t time_to_run);


#endif /* _ILRD_TASK_H */
