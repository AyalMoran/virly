/******************
 Author : Ayal Moran
 Reviewer: Or Oved
 Date:	23.4.25
 *****************/
#include <assert.h> /* assert 	*/
#include <stdlib.h> /* malloc	*/

#include "Heap.h" /* sortl_t 	*/
#include "PQ.h"   /* pq_t   	*/

struct pq
{
    heap_t* elements;
};

pq_t* PQCreate(int (*cmp_func)(const void* data1, const void* data2))
{
    pq_t* pq = NULL;

    assert(cmp_func);

    pq = (pq_t*) malloc(sizeof(pq_t));
    if (NULL == pq)
    {
        return NULL;
    }

    pq->elements = HeapCreate(cmp_func);
    if (NULL == pq->elements)
    {
        free(pq);
        return NULL;
    }

    return pq;
}

void PQDestroy(pq_t* queue)
{
    assert(queue);

    HeapDestroy(queue->elements);
    free(queue);
}

int PQEnqueue(pq_t* queue, void* data)
{

    assert(queue);

    return HeapPush(queue->elements, data);
    ;
}

void* PQDequeue(pq_t* queue)
{
    void* return_data = NULL;
    assert(queue);
    assert(!PQIsEmpty(queue));

    return_data = HeapPeek(queue->elements);
    HeapPop(queue->elements);
	
    return return_data;
}

void* PQPeek(const pq_t* queue)
{
    assert(queue);
    assert(!PQIsEmpty(queue));

    return HeapPeek(queue->elements);
}

int PQIsEmpty(const pq_t* queue)
{
    assert(queue);

    return HeapIsEmpty(queue->elements);
}

size_t PQSize(const pq_t* queue)
{
    assert(queue);

    return HeapSize(queue->elements);
}

void* PQErase(pq_t* queue, int (*is_match_func)(const void* data, void* param),
              void* param)
{
    assert(queue);
    assert(is_match_func);

    return HeapRemove(queue->elements, is_match_func, param);
}

void PQClear(pq_t* queue)
{
    assert(queue);

    while (!HeapIsEmpty(queue->elements))
    {
        HeapPop(queue->elements);
    }
}
