/**************************************************************
 * File    : Heap.c
 * Author  : Ayal Moran
 * Reviewer: 
 * Date    : 
**************************************************************/
#ifndef __HEAP_H__
#define __HEAP_H__

#include <stddef.h> /* size_t */

typedef int(*heap_cmp_t)(const void* data1, const void* data2);
typedef int(*heap_is_match_t)(const void* data, void* param);

typedef struct heap heap_t;

/*time O(1), space O(1)*/
heap_t* HeapCreate(heap_cmp_t cmp);

/*time O(n), space O(1)*/
void HeapDestroy(heap_t* heap);

/*time O(log n), space O(log n)*/
int HeapInsert(heap_t* heap, void* data);

/*time O(1), space O(1)*/
void* HeapPeek(const heap_t* heap);

/*time O(log n), space O(log n)*/
void HeapPop(heap_t* heap);

/*time O(1), space O(1)*/
int HeapIsEmpty(const heap_t* heap);

/*time O(1), space O(1)?*/
size_t HeapSize(const heap_t* heap);

/*time O(n), space O(1)*/
void* HeapRemove(heap_t* heap, heap_is_match_t callback, void* param);

#endif /* __HEAP_H__ */
