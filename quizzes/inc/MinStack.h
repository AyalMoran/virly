#ifndef ILRD_MINSTACK_H
#define ILRD_MINSTACK_H

#include <stddef.h>

/*
Implement a wrapper API that extends the functionality of an existing API to an ordinary stack data structure, by enabling retrieval of the value of the minimum element in constant time.

For example, if the following elements are pushed to the stack: [10, 17, 5, 22, 13], then the MinStackGetMin function should return 5.

Constraints:
Click the API tab to see all the header files. Note the dropdown menu icon.
The complexity of the original Push and Pop functions must preserved.
Improve the provided implementation of the function MinStackCreate.
Add implementation for the functions MinStackPush, MinStackPop and MinStackGetMin.
You can ignore the other functions, as they are not tested here.
*/

typedef struct MinStack minstack_ty;

minstack_ty* MinStackCreate(size_t capacity);
int MinStackPush(minstack_ty* minstack, int data);
void MinStackPop(minstack_ty* minstack);
int MinStackGetMin(minstack_ty* minstack);
void MinStackDestroy(minstack_ty* minstack);

#endif /* ILRD_MINSTACK_H */
