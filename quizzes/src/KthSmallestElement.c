/**************************************************************
 * File    : KthSmallestElement.c
 * Author  : Ayal Moran
 * Reviewer: 
 * Date    : 
**************************************************************/

/*============================ INCLUDES ============================*/
#include <stddef.h>
#include "PQ.h"

#include "KthSmallestElement.h"

/*========================== DEFINITIONS ===========================*/

static int IsBefore(const void* a, const void* b)
{
    return (0 < *(int*)a - *(int*)b);
}

int KthSmallestElement(const int numbers[], size_t size, size_t k)
{
    size_t i = 0;
    int ret = -1;
    
    pq_t* queue = PQCreate(IsBefore);
    if(!queue)
    {
        return -1;
    }
    
    while(i < size)
    {
        PQEnqueue(queue, (void*)(numbers + i));
        ++i;
    }
    
    i = 0;
    
    while(i < k)
    {
        ret = *(int*)PQPeek(queue);
        PQDequeue(queue);
        ++i;
    }
    
    PQDestroy(queue);
    
    return ret;
}
