/**************************************************************
 * File    : MinStackTest.c
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "MinStack.h"
#include "test_utils.h"

/******************************************************
 * START OF ACTUAL TESTS
 ******************************************************/

int main(void)
{
    minstack_ty* minstack = NULL;
    int min_val = 0;
    size_t capacity = 10;
    
    printf("Testing MinStack implementation:\n");
    printf("===============================\n\n");
    
    minstack = MinStackCreate(capacity);
    if (NULL == minstack)
    {
        printf("Failed to create MinStack\n");
        return 1;
    }
    
    printf("Pushing elements: 10, 17, 5, 22, 13\n");
    MinStackPush(minstack, 10);
    printf("  After pushing 10, min = %d\n", MinStackGetMin(minstack));
    
    MinStackPush(minstack, 17);
    printf("  After pushing 17, min = %d\n", MinStackGetMin(minstack));
    
    MinStackPush(minstack, 5);
    printf("  After pushing 5, min = %d\n", MinStackGetMin(minstack));
    
    MinStackPush(minstack, 22);
    printf("  After pushing 22, min = %d\n", MinStackGetMin(minstack));
    
    MinStackPush(minstack, 13);
    printf("  After pushing 13, min = %d\n", MinStackGetMin(minstack));
    
    min_val = MinStackGetMin(minstack);
    printf("\nFinal minimum value: %d\n", min_val);
    printf("Expected: 5\n");
    printf("Result: %s\n\n", (min_val == 5) ? "PASS" : "FAIL");
    
    printf("Popping elements:\n");
    MinStackPop(minstack);
    printf("  After popping, min = %d (expected: 5)\n", MinStackGetMin(minstack));
    
    MinStackPop(minstack);
    printf("  After popping, min = %d (expected: 5)\n", MinStackGetMin(minstack));
    
    MinStackPop(minstack);
    printf("  After popping, min = %d (expected: 10)\n", MinStackGetMin(minstack));
    
    MinStackPop(minstack);
    printf("  After popping, min = %d (expected: 10)\n", MinStackGetMin(minstack));
    
    MinStackDestroy(minstack);
    
    return 0;
}
