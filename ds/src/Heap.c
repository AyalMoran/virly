/*
*************************************************************
 *  File        : Heap.c
 *  Author      : Ayal Moran
 *  Reviewer    : Nadav Eyal
 *  Date        : 06-12-2025
 **************************************************************/
/*
 *============================ INCLUDES ============================*/
#include <assert.h> /* assert       */
#include <stdlib.h> /* malloc       */

#include "Heap.h"     /* heap_t       */
#include "d_vector.h" /* d_vector_t   */

/*
 *========================== MACRO UTILS ===========================*/
#define FAILURE (1)
#define SUCCESS (0)
#define FALSE (0)
#define INIT_UNUSED_VALUE (0)
#define DEFAULT_CAPACITY (8)

#define CELL(vec, i) ((void**) DVectorGetAccessToElement((vec), (i)))
#define DATA(vec, i) (*(void**) DVectorGetAccessToElement((vec), (i)))
#define PARENT(index) ((size_t) ((0 == (index)) ? 0 : (((index) - 1) / 2)))
#define LEFT_CHILD(index) ((size_t) (((index) * 2) + 1))
#define RIGHT_CHILD(index) ((size_t) (((index) * 2) + 2))

/*
 *========================= TYPEDEFS/ENUMS =========================*/
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

/*
 *====================== STATIC DECLARATIONS =======================*/
static void HeapifyUp(heap_t* heap, size_t index);
static void HeapifyDown(heap_t* heap, size_t index);
static void Swap(void** a, void** b);

/*
 *========================= API FUNCTIONS ==========================*/
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
    size_t push_index = INIT_UNUSED_VALUE;

    assert(NULL != heap);

    ret = DVectorPushBack(heap->heap, &data);
    if (SUCCESS != ret)
    {
        return FAILURE;
    }

    push_index = HeapSize(heap);
    if (1 < push_index)
    {
        HeapifyUp(heap, push_index - 1);
    }

    return SUCCESS;
}

void HeapPop(heap_t* heap)
{
    d_vector_t* vec = NULL;
    size_t last_index = INIT_UNUSED_VALUE;

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
    assert(FALSE == HeapIsEmpty(heap));

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
    d_vector_t* vec = NULL;
    void* removed = NULL;
    size_t size = INIT_UNUSED_VALUE;
    size_t parent_idx = INIT_UNUSED_VALUE;
    size_t i = 0;

    assert(NULL != heap);
    assert(NULL != callback);
    assert(FALSE == HeapIsEmpty(heap));

    vec = heap->heap;
    size = HeapSize(heap);

    while (i < size && FALSE == callback(DATA(vec, i), param))
    {
        ++i;
    }

    if (i == size)
    {
        return NULL;
    }

    removed = DATA(vec, i);

    if (i == size - 1)
    {
        DVectorPopBack(vec);
    }
    else
    {
        Swap(CELL(vec, i), CELL(vec, size - 1));
        DVectorPopBack(vec);

        if (i < HeapSize(heap))
        {
            parent_idx = PARENT(i);

            if (0 < heap->cmp(DATA(vec, i), DATA(vec, parent_idx)))
            {
                HeapifyUp(heap, i);
            }
            else
            {
                HeapifyDown(heap, i);
            }
        }
    }

    return removed;
}

#ifndef NDEBUG
void* HeapPeekAtIndex(const heap_t* heap, size_t index)
{
    assert(NULL != heap);
    assert(index < HeapSize(heap));

    return DATA(heap->heap, index);
}
#endif

/*
 *======================= STATIC FUNCTIONS ========================*/
static void HeapifyUp(heap_t* heap, size_t index)
{
    d_vector_t* vec = NULL;
    size_t parent = INIT_UNUSED_VALUE;

    assert(NULL != heap);

    vec = heap->heap;
    parent = PARENT(index);

    if (0 == index)
    {
        return;
    }

    if (0 <= heap->cmp(DATA(vec, parent), DATA(vec, index)))
    {
        return;
    }

    Swap(CELL(vec, parent), CELL(vec, index));
    HeapifyUp(heap, parent);
}

static void HeapifyDown(heap_t* heap, size_t index)
{
    d_vector_t* vec = NULL;
    size_t size = HeapSize(heap);
    size_t left = LEFT_CHILD(index);
    size_t right = RIGHT_CHILD(index);
    size_t child = INIT_UNUSED_VALUE;

    assert(NULL != heap);

    vec = heap->heap;

    if (left >= size)
    {
        return;
    }

    if (right < size && 0 < heap->cmp(DATA(vec, right), DATA(vec, left)))
    {
        child = right;
    }
    else{
        child = left;
    }

    if (0 > heap->cmp(DATA(vec, child), DATA(vec, index)))
    {
        return;
    }

    Swap(CELL(vec, child), CELL(vec, index));
    HeapifyDown(heap, child);
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
