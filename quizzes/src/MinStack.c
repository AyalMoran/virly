/**************************************************************
 * File    : MinStack.c
 * Author  : Ayal Moran
 * Reviewer: 
 * Date    : 
**************************************************************/

/*============================ INCLUDES ============================*/
#include <stdlib.h> /* malloc */
#include <assert.h> /* assert */

#include "stack.h"
#include "MinStack.h"

/*========================== DEFINITIONS ===========================*/

struct MinStack
{
    stack_ty* stack;
	int min;
};

minstack_ty* MinStackCreate(size_t capacity)
{
    minstack_ty* minstack = malloc(sizeof(*minstack));
	if (!minstack)
    {
		return NULL;
    }
    
	minstack->stack = StackCreate(capacity);
    if (!minstack->stack)
    {
        free(minstack);
		return NULL;
    }
    
    minstack->min = 0;
    
    return minstack;
}

int MinStackPush(minstack_ty* minstack, int data)
{
    int val = data;
    
    assert(minstack);
    
    if(!StackSize(minstack->stack))
    {
        minstack->min = data;
    }

    else if(data < minstack->min)
    {
        val = 2 * data - minstack->min;
        minstack->min = data;
    }

    return StackPush(minstack->stack, val);
}

int MinStackGetMin(minstack_ty* minstack)
{
    assert(minstack);
    
    return minstack->min;
}

void MinStackPop(minstack_ty* minstack)
{
    int top;
    
    assert(minstack);
    
    top = StackPeek(minstack->stack);
    
    if (top < minstack->min)
    {
        minstack->min = 2 * minstack->min - top;
    }

    StackPop(minstack->stack);   
}

void MinStackDestroy(minstack_ty* minstack)
{
    assert(minstack);
    
    StackDestroy(minstack->stack);
    free(minstack);
}
