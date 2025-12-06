/**************************************************************
 * File    : Sort.c
 * Author  : Ayal Moran
 * Reviewer: 
 * Date    : 
**************************************************************/
#ifndef __SORT_H__
#define __SORT_H__

#include <stddef.h>

int* BinarySearchIterative(const int* arr, size_t size, int elem);

int* BinarySearchRecursive(const int* arr, size_t size, int elem);

int MergeSort(int* arr, size_t size);

void QuickSort(void* base, size_t nitems, size_t element_size, int (*compare)(const void* , const void*));

#endif