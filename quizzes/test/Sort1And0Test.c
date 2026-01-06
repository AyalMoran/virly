/**************************************************************
 * File    : Sort1And0Test.c
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "Sort1And0.h"
#include "test_utils"

/******************************************************
 * START OF ACTUAL TESTS
 ******************************************************/
static void PrintArr(int* arr, size_t size)
{
    size_t i = 0;
    for (i = 0; i < size; ++i)
    {
        printf("%d ", arr[i]);
    }
    printf("\n");
}

int main(void)
{

    int arr[] = {1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 0};
    PrintArr(arr, 18);
    Sort1And0(arr, 18);
    PrintArr(arr, 18);

    return 0;
}
