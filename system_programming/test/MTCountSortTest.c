/**************************************************************
 * File    : MTCountSortTest.c
 * Author  : Ayal Moran
 * Reviewer: Yohai S.
 * Date    : 11-1-2026
 **************************************************************/

#include <stdio.h>
#include <stdlib.h>
#include <assert.h>

#include "MTCountSort.h"
#include "test_utils.h"

static int IsSorted(char* arr, size_t size);

int main( int argc, char* argv[])
{
    char* out = NULL;
    size_t out_size = 0;

    printf("MTCountSort Test\n");
/* 
    SET_PRINT_COLOR(FG_GREEN);
    printf("Sorting dictionary with 1 thread:\n");
    SET_PRINT_COLOR(RESET);
    SortDictEx2(1, &out, &out_size);
    assert(IsSorted(out, out_size));
    free(out); 

    out = NULL;
    SET_PRINT_COLOR(FG_GREEN);
    printf("Sorting dictionary with 2 threads:\n");
    SET_PRINT_COLOR(RESET);
    SortDictEx2(2, &out, &out_size);
    assert(IsSorted(out, out_size));
    free(out);

    SET_PRINT_COLOR(FG_GREEN);
    printf("Sorting dictionary with 4 threads:\n");
    SET_PRINT_COLOR(RESET);
    SortDictEx2(4, &out, &out_size);
    assert(IsSorted(out, out_size));
    free(out); */

    SET_PRINT_COLOR(FG_GREEN);
    printf("Sorting dictionary with 8 threads:\n");
    SET_PRINT_COLOR(RESET);
    SortDictEx2(8, &out, &out_size);
    assert(IsSorted(out, out_size));
    free(out);

    (void) argc;
    (void) argv;
    (void )test_count;
    (void )total_tests;
    (void )passed_tests;
    (void)test_registry;

    return 0;   
}

static int IsSorted(char* arr, size_t size)
{
    size_t i = 0;
    for (i = 1; i < size; ++i)
    {
        if (arr[i - 1] > arr[i])
        {
            return 0;
        }
    }
    printf("Array is sorted!\n");
    fflush(stdout);
    return 1;
}
