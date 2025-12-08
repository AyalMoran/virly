/******************
 Author : Ayal Moran
 Reviewer:
 Date: 23.4.25
 *****************/
#include <stdlib.h> /* 	malloc 		*/
#include <UID.h>	/* 	ilrd_uid_t 	*/
#include <time.h>	/*	time_t		*/
#include <assert.h> /*	assert		*/
#include <unistd.h> /*	sleep		*/

#include "Task.h"   /* 	task_t		*/

struct task 
{
	time_t time_to_run;
	int (*callback_func)(void* param);
	void (*cleanup_func)(void* param);
	void* param;
	ilrd_uid_t uid;
};

task_t* TaskCreate(int (*callback_func)(void* param),void (*cleanup_func)(void* param), void* param, time_t time_to_run)
{
	task_t* task = NULL;
	
	assert(callback_func);

	
	task = (task_t*) malloc(sizeof(task_t));
	if (NULL == task)
	{
		return NULL;
	}
	
	task->callback_func = callback_func;
	task->cleanup_func = cleanup_func;
	task->param = param;
	task->time_to_run = time_to_run;
	
	task->uid = UIDCreate();
/*	if(UIDIsSame(task->uid, UIDBadUID))*/
/*	{*/
	/*	free(task);	*/
/*		return NULL;*/
/*	}*/ /*TODO How would we know if malloc or UIDCreate failed? maybe not return anything?*/

	return task;
}

void TaskDestroy(task_t* task)
{
	assert(task);
	
	if(task->cleanup_func)
	{
		task->cleanup_func(task->param);
	}
	
	free(task);
}

int TaskRun(task_t* task)
{
	assert(task);

	return task->callback_func(task->param);
}

ilrd_uid_t TaskGetUID(const task_t* task)
{
	assert(task);

	return task->uid;
}

time_t TaskGetTime(const task_t* task)
{
	assert(task);

	return task->time_to_run;
}

void TaskSetTime(task_t* task, time_t time_to_run)
{
	assert(task);

	task->time_to_run = time_to_run;
}

