/**************************************************************
 *  File        : Heap.c
 *  Author      : Ayal Moran
 *  Reviewer    :
 *  Date        :
 **************************************************************/

#include <assert.h> /* assert       */
#include <stdlib.h> /* malloc       */

#include "d_vector.h" /* d_vector_t   */
#include "Heap.h"     /* heap_t       */

#define FAIL (1)
#define SUCCESS (0)

#define FALSE (0)

#define CELL(vec, i) ((void**) DVectorGetAccessToElement((vec), (i)))
#define DATA(vec, i) (*(void**) DVectorGetAccessToElement((vec), (i)))
#define PARENT(index) ((size_t) ((0 == (index)) ? 0 : (((index) - 1) / 2)))
#define LEFT_CHILD(index) ((size_t) (((index) * 2) + 1))
#define RIGHT_CHILD(index) ((size_t) (((index) * 2) + 2))
#define DEFAULT_CAPACITY (8)

typedef enum direction
{
    LEFT = 0,
    RIGHT = 1
} direction_t;

struct heap
{
    heap_cmp_t cmp;
    d_vector_t* heap;
};

/*--- static decs ---*/
static void HeapifyUp(heap_t* heap, size_t index);
static void HeapifyDown(heap_t* heap, size_t index);
static void Swap(void** a, void** b);

/*--- API ---*/
heap_t* HeapCreate(heap_cmp_t cmp)
{
    heap_t* heap = NULL;

    assert(NULL != cmp);

    heap = (heap_t*) malloc(sizeof(heap_t));
    if (NULL == heap)
    {
        return NULL;
    }

    heap->heap = DVectorCreate(DEFAULT_CAPACITY, sizeof(void*));
    if (NULL == heap->heap)
    {
        free(heap);
        return NULL;
    }

    heap->cmp = cmp;

    return heap;
}

void HeapDestroy(heap_t* heap)
{
    assert(NULL != heap);

    DVectorDestroy(heap->heap);
    free(heap);
}

int HeapPush(heap_t* heap, void* data)
{
    int ret = SUCCESS;
    size_t push_index = 0;

    assert(NULL != heap);

    ret = DVectorPushBack(heap->heap, &data);
    if (SUCCESS != ret)
    {
        return FAIL;
    }

    push_index = HeapSize(heap);
    if (1 < push_index)
    {
        HeapifyUp(heap, push_index - 1);
    }

    return SUCCESS;
}

#ifndef NDEBUG
void* HeapPeekAtIndex(const heap_t* heap, size_t index)
{
    assert(NULL != heap);
    assert(index < HeapSize(heap));

    return DATA(heap->heap, index);
}
#endif

void HeapPop(heap_t* heap)
{
    d_vector_t* vec = NULL;
    size_t last_index = 0;

    assert(NULL != heap);
    assert(0 == HeapIsEmpty(heap));

    vec = heap->heap;
    last_index = HeapSize(heap) - 1;

    if (0 == last_index)
    {
        DVectorPopBack(vec);
        return;
    }

    Swap(CELL(vec, 0), CELL(vec, last_index));
    DVectorPopBack(vec);

    if (1 < last_index)
    {
        HeapifyDown(heap, 0);
    }
}

void* HeapPeek(const heap_t* heap)
{
    assert(NULL != heap);
    assert(!HeapIsEmpty(heap));

    return DATA(heap->heap, 0);
}

int HeapIsEmpty(const heap_t* heap)
{
    assert(NULL != heap);

    return (0 == DVectorSize(heap->heap));
}

size_t HeapSize(const heap_t* heap)
{
    assert(NULL != heap);

    return DVectorSize(heap->heap);
}

void* HeapRemove(heap_t* heap, heap_is_match_t callback, void* param)

{
    void* removed = NULL;
    d_vector_t* vec = NULL;
    size_t size = 0;
    size_t i = 0;
    size_t parent_idx = 0;

    assert(NULL != heap);
    assert(NULL != callback);
    assert(0 == HeapIsEmpty(heap));

    vec = heap->heap;
    size = HeapSize(heap);
    i = 0;

    while (i < size && FALSE == callback(DATA(vec, i), param))
    {
        ++i;
    }

    if (i == size)
    {
        return NULL;
    }

    removed = DATA(vec, i);

    Swap(CELL(vec, i), CELL(vec, size - 1));
    DVectorPopBack(vec);

    if (i < HeapSize(heap))
    {
        parent_idx = Parent(i);

        if (0 < heap->cmp(DATA(vec, i), DATA(vec, parent_idx)))
        {
            HeapifyUp(heap, i);
        }
        else
        {
            HeapifyDown(heap, i);
        }
    }

    return removed;
}

/*--- helpers ---*/
static void HeapifyUp(heap_t* heap, size_t index)
{
    d_vector_t* vec = NULL;
    size_t parent = 0;

    assert(NULL != heap);

    vec = heap->heap;

    while (0 < index)
    {
        parent = Parent(index);

        if (0 <= heap->cmp(DATA(vec, parent), DATA(vec, index)))
        {
            return;
        }

        Swap(CELL(vec, parent), CELL(vec, index));
        index = parent;
    }
}

static void HeapifyDown(heap_t* heap, size_t index)
{
    d_vector_t* vec = NULL;
    size_t size = HeapSize(heap);
    size_t right = RIGHT_CHILD(index);
    size_t left = LEFT_CHILD(index);
    size_t child = left;

    assert(NULL != heap);

    vec = heap->heap;

    while (left < size)
    {
        right = RIGHT_CHILD(index);
        child = left;

        if (right < size &&
            0 < heap->cmp(DATA(vec, right), DATA(vec, left)))
        {
            child = right;
        }

        if (0 >= heap->cmp(DATA(vec, child), DATA(vec, index)))
        {
            return;
        }

        Swap(CELL(vec, child), CELL(vec, index));
        index = child;
        left = LEFT_CHILD(index);
    }
}

static void Swap(void** a, void** b)
{
    void* tmp = NULL;

    assert(NULL != a);
    assert(NULL != b);

    tmp = *a;
    *a = *b;
    *b = tmp;
}
