#include <assert.h>/*assert*/
#include <stdlib.h>/*malloc*/
#include <string.h>/*memcpy*/

#include "stack.h" /*stack_t*/

#define TRUE 1
#define FALSE 0

struct stack
{
    size_t element_size;
    size_t size;
    size_t capacity;
    char* container;
};

stack_t* StackCreate(size_t capacity, size_t element_size)
{
    stack_t* stack_pointer =
        (stack_t*) malloc(sizeof(stack_t) + (element_size * capacity));
    if (NULL == stack_pointer)
    {
        return NULL;
    }

    stack_pointer->size = 0;
    stack_pointer->capacity = capacity;
    stack_pointer->element_size = element_size;
    stack_pointer->container = (char*) (stack_pointer + 1);

    return stack_pointer;
}

void StackDestroy(stack_t* stack)
{
    assert(stack);

    free(stack);
}

stack_status_t StackPush(stack_t* stack, const void* element)
{
    assert(stack);
    assert(element);


    if (stack->size == stack->capacity)
    {
        return STACK_FULL;
    }
    memcpy(((stack->container) + (stack->size * stack->element_size)), element,
           stack->element_size);

    ++(stack->size);

    return STACK_SUCCESS;
}

void StackPop(stack_t* stack, int clear_flag)
{
    assert(stack);

    if (TRUE == clear_flag && !StackIsEmpty(stack))
    {
        memset((stack->container) + ((stack->size - 1) * stack->element_size),
               0, stack->element_size);
    }

    if (stack->size)
    {
        --(stack->size);
    }
}

void* StackPeek(stack_t* stack)
{
    char* address_of_element = NULL;

    assert(stack);

    if (StackIsEmpty(stack))
    {
        return NULL;
    }

    address_of_element =
        ((stack->container) + (((stack->size) - 1) * (stack->element_size)));

    return (void*) address_of_element;
}

size_t StackSize(const stack_t* stack)
{
    assert(stack);

    return stack->size;
}

size_t StackCapacity(const stack_t* stack)
{
    assert(stack);

    return stack->capacity;
}

int StackIsEmpty(const stack_t* stack)
{
    assert(stack);

    return (stack->size == 0);
}
