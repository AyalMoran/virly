#ifndef _STACK_H_
#define _STACK_H_

#include <stddef.h> /*size_t*/

typedef struct stack stack_t;

typedef enum stack_status
{
    STACK_FULL = -1,
    STACK_SUCCESS = 0,
    STACK_ALLOC_ERROR = 1
} stack_status_t;

/**
 * @brief Creates a new stack.
 * 
 * @param capacity The maximum number of elements the stack can hold.
 * @param element_size The size of each element in bytes.
 * @return A pointer to the newly created stack, or NULL if memory allocation fails.
 * @timecomplexity O(1)
 * @spacecomplexity O(capacity * element_size)
 */
stack_t* StackCreate(size_t capacity, size_t element_size);

/**
 * @brief Destroys the stack and frees all allocated memory.
 * 
 * @param stack A pointer to the stack to be destroyed.
 * @timecomplexity O(1)
 * @spacecomplexity O(1)
 */
void StackDestroy(stack_t* stack);

/**
 * @brief Pushes an element onto the stack.
 * 
 * @param stack A pointer to the stack.
 * @param element A pointer to the element to be pushed onto the stack.
 * @timecomplexity O(1)
 * @spacecomplexity O(1)
 */
stack_status_t StackPush(stack_t* stack, const void* element);

/**
 * @brief Removes the top element from the stack.
 * 
 * @param stack A pointer to the stack.
 * @param clear_flag If set to TRUE, the memory of the popped element will be cleared (set to zero).
 * @timecomplexity O(1)
 * @spacecomplexity O(1)
 */
void StackPop(stack_t* stack, int clear_flag);

/**
 * @brief Retrieves the top element of the stack without removing it.
 * 
 * @param stack A pointer to the stack.
 * @return A pointer to the top element of the stack, or NULL if the stack is empty.
 * @timecomplexity O(1)
 * @spacecomplexity O(1)
 */
void* StackPeek(stack_t* stack);

/**
 * @brief Gets the current number of elements in the stack.
 * 
 * @param stack A pointer to the stack.
 * @return The number of elements in the stack.
 * @timecomplexity O(1)
 * @spacecomplexity O(1)
 */
size_t StackSize(const stack_t* stack);

/**
 * @brief Gets the maximum capacity of the stack.
 * 
 * @param stack A pointer to the stack.
 * @return The maximum number of elements the stack can hold.
 * @timecomplexity O(1)
 * @spacecomplexity O(1)
 */
size_t StackCapacity(const stack_t* stack);

/**
 * @brief Checks if the stack is empty.
 * 
 * @param stack A pointer to the stack.
 * @return 1 if the stack is empty, 0 otherwise.
 * @timecomplexity O(1)
 * @spacecomplexity O(1)
 */
int StackIsEmpty(const stack_t* stack);

#endif /*_STACK_H_*/
