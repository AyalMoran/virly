/**************************************************************
 * File    : Sort1And0.c
 * Author  : Ayal Moran
 * Reviewer: 
 * Date    : 
**************************************************************/

/*============================ INCLUDES ============================*/
#include "Sort1And0.h"
#include <stddef.h>

#include <stdio.h>

/*========================== DEFINITIONS ===========================*/
#define TRUE  (1)
#define FALSE (0)
#define SUCCESS (0)
#define FAILURE (1)


static void swap(int* arr, size_t left, size_t right)
{
    int tmp = arr[left];
    arr[left] = arr[right];
    arr[right] = tmp;
}

void Sort1And0(int* arr, size_t size)
{
    size_t left = 0;
    size_t right = size - 1;

    assert(arr);

    while (left < right)
    {
        while (left != size && arr[left] == 0)
        {
            ++left;
        }

        while (right != left && arr[right] == 1)
        {
            --right;
        }

        if (right != left)
        {
            swap(arr, left, right);
            ++left;
            --right;
        }
    }
}

