/*
*************************************************************
*  File        : Sort.c
*  Author      : Ayal Moran
*  Reviewer    :
*  Date        : 04-12-2025
**************************************************************/

#include <assert.h> /* assert() */
#include <stddef.h> /* size_t   */
#include <stdlib.h> /* malloc() */
#include <string.h>
/*============================ INCLUDES ============================*/
#include "Sort.h"

/*========================== DEFINITIONS ===========================*/
#define TRUE (1)
#define FALSE (0)
#define SUCCESS (0)
#define FAILURE (1)

/*========================== MACRO UTILS ===========================*/

/*========================= TYPEDEFS/ENUMS =========================*/

/*====================== STATIC DECLARATIONS =======================*/
static int RecMergeSort(int* arr, size_t start, size_t end);
static void Swap(int* a, int* b);
static int Merge(int* arr, size_t start, size_t mid, size_t end);
static size_t Partition(void* base, size_t low, size_t high, size_t size, int (*compar)(const void*, const void*));
static void QSortHelper(void* base, size_t low, size_t high, size_t size, int (*compar)(const void*, const void*));

/*========================= API FUNCTIONS ==========================*/
int* BinarySearchIterative(const int* arr, size_t size, int elem)
{
    size_t lo = 0;
    size_t mid = 0;
    size_t hi = size - 1;

    assert(arr);

    while (lo <= hi)
    {
        mid = lo + (hi - lo) / 2;

        if (elem == *(arr + mid))
        {
            return (int*) (arr + mid);
        }
        else if (*(arr + mid) < elem)
        {
            lo = mid + 1;
        }
        else
        {
            hi = mid + -1;
        }
    }

    return NULL;
}

int* BinarySearchRecursive(const int* arr, size_t size, int elem)
{
    size_t low = 0;
    size_t mid = 0;
    size_t high = size - 1;
    int* result = 0;

    assert(NULL != arr);

    if (0 == size)
    {
        return NULL;
    }

    mid = low + (high - low) / 2;

    if (elem == arr[mid])
    {
        return (int*) arr + mid;
    }
    else if (elem > arr[mid])
    {
        result = BinarySearchRecursive(arr + mid + 1, high - mid, elem);
        return *result == elem ? NULL : mid + 1 + result;
    }
    else
    {
        return BinarySearchRecursive(arr, mid, elem);
    }
}

int MergeSort(int* arr, size_t size)
{
    assert(NULL != arr);

    if (1 >= size)
    {
        return 0;
    }

    RecMergeSort(arr, 0, size - 1);

    return SUCCESS;
}

void QuickSort(void* base, size_t nitems, size_t element_size,
               int (*compare)(const void*, const void*))
{
    assert(NULL != base);
    assert(NULL != compare);

    if (nitems > 1)
    {
        QSortHelper(base, 0, nitems - 1, element_size, compare);
    }
}
/*======================= STATIC FUNCTIONS ========================*/
static int RecMergeSort(int* arr, size_t start, size_t end)
{
    size_t mid = 0;

    assert(NULL != arr);

    if (start >= end)
    {
        return 0;
    }

    mid = start + (end - start) / 2;

    if (0 != RecMergeSort(arr, start, mid))
    {
        return 1;
    }

    if (0 != RecMergeSort(arr, mid + 1, end))
    {
        return 1;
    }

    return Merge(arr, start, mid, end);
}

static void Swap(int* a, int* b)
{
    *a = *a ^ *b;
    *b = *a ^ *b;
    *a = *a ^ *b;
}

static int Merge(int* arr, size_t start, size_t mid, size_t end)
{
    size_t size1 = mid - start + 1;
    size_t size2 = end - mid;
    size_t k = start;
    size_t i = 0;
    size_t j = 0;
    int* left_arr = NULL;
    int* right_arr = NULL;

    left_arr = (int*) malloc(size1 * sizeof(int));
    if (NULL == left_arr)
    {
        return 1;
    }

    right_arr = (int*) malloc(size2 * sizeof(int));
    if (NULL == right_arr)
    {
        free(left_arr);
        return 1;
    }

    assert(NULL != left_arr);
    assert(NULL != right_arr);

    for (; size1 > i; ++i)
    {
        left_arr[i] = arr[start + i];
    }

    for (; size2 > j; ++j)
    {
        right_arr[j] = arr[(mid + 1) + j];
    }

    i = 0;
    j = 0;

    while ((size1 > i) && (size2 > j))
    {
        if (left_arr[i] <= right_arr[j])
        {
            arr[k] = left_arr[i];
            ++i;
        }
        else
        {
            arr[k] = right_arr[j];
            ++j;
        }
        ++k;
    }

    while (size1 > i || size2 > j)
    {
        arr[k] = size1 > i ? left_arr[++i - 1] : right_arr[++j - 1];
        ++k;
    }

    free(left_arr);
    free(right_arr);

    return 0;
}

static void QSortHelper(void* base, size_t low, size_t high, size_t size, int (*compar)(const void*, const void*))
{
    if (low < high)
    {
        size_t pivot = Partition(base, low, high, size, compar);

        QSortHelper(base, low, pivot, size, compar);
        QSortHelper(base, pivot + 1, high, size, compar);
    }
}

static size_t Partition(void* base, size_t low, size_t high, size_t size, int (*compar)(const void*, const void*))
{
    char*  arr   = (char*) base;
    char*  pivot = arr + (low * size);
    size_t i     = low - 1;
    size_t j     = high + 1;

    while (1)
    {
        do
        {
            ++i;
        } while (compar(arr + i * size, pivot) < 0);
        
        do
        {
            --j;
        } while (compar(arr + j * size, pivot) > 0);

        if (i >= j)
        {
            return j;
        }

        SwapVoid(arr + i * size, arr + j * size, size);
    }
}
