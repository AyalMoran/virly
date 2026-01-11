/**************************************************************
 * File    : KthSmallestElementTest.c
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "KthSmallestElement.h"
#include "test_utils.h"

/******************************************************
 * START OF ACTUAL TESTS
 ******************************************************/

int main(void)
{
    int arr[] = {8, 6, 12, 5, 3, 27, 15, 33};
    size_t size = sizeof(arr) / sizeof(arr[0]);
    size_t k = 3;
    int result = 0;
    
    printf("Array: ");
    for (size_t i = 0; i < size; ++i)
    {
        printf("%d ", arr[i]);
    }
    printf("\n");
    
    result = KthSmallestElement(arr, size, k);
    
    printf("The %zu-th smallest element is: %d\n", k, result);
    printf("Expected: 6\n");
    
    return 0;
}
