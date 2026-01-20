/******************
 Queue - Source File
 Author : Ayal Moran
 Reviewer: Yarden R.
 Date: 2.4.25
 *****************/
#include <stdlib.h> 	/* malloc  */
#include <assert.h> 	/* assert  */
 
#include "SL_List.h"	/* sll_t   */
#include "q.h"			/* queue_t */

struct queue
{
    sll_t* list;
};

queue_t* QCreate(void)
{
	queue_t* queue = (queue_t*) malloc(sizeof(queue_t));
	if(!queue)
	{
		return NULL;
	}
	
	queue->list = SLLCreate();
	if(!(queue->list))
	{
		free(queue);
		return NULL;
	}
	
	return queue;
}

void QDestroy(queue_t* queue)
{
	assert(queue);
	
	SLLDestroy(queue->list);
	
	free(queue);

}

int QEnqueue(queue_t* queue, void* data)
{
	assert(queue);
	
	return (SLLIterIsEqual(SLLEnd(queue->list), SLLInsert(SLLEnd(queue->list), data)));
}

void QDequeue(queue_t* queue)
{
	assert(queue);
	
	SLLRemove(SLLBegin(queue->list));
}

void* QPeek(const queue_t* queue)
{
	assert(queue);
		
	if(SLLIsEmpty(queue->list))
	{
		return NULL;
	}
	
	return SLLGetData(SLLBegin(queue->list));
}

size_t QSize(const queue_t* queue)
{
	assert(queue);
	
	return SLLCount(queue->list);
}

int QIsEmpty(const queue_t* queue)
{
	assert(queue);
	
	return (SLLIsEmpty(queue->list));
}

void QAppend(queue_t* dest, queue_t* src)
{	
	assert(dest);
	assert(src);
	
	if(!QIsEmpty(src))
	{
		SLLAppend(dest->list,src->list);
	}

	
}


