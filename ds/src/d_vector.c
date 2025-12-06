/*************************************
 *            Author: Ayal Moran      *
 *         Reviewer:   Yarden         *
 *           Date: 30March            *
 *************************************/
#include <assert.h>/*assert*/
#include <stdlib.h>/*malloc*/
#include <string.h>/*memmove*/

#include "d_vector.h" /*d_vector_t*/

struct d_vector
{
    size_t capacity;
    size_t element_size;
    size_t size;
    char* elements;
};

#define RESIZE_FACTOR (2)
#define SHRINK_CONDITION (4)

d_vector_t* DVectorCreate(size_t capacity, size_t element_size)
{

    size_t actual_cap =
        capacity < DEFAULT_CAPACITY ? DEFAULT_CAPACITY : capacity;

    d_vector_t* new_vector = (d_vector_t*) malloc(sizeof(d_vector_t));
    if (!new_vector)
    {
        return NULL;
    }

    new_vector->elements = (char*) malloc(actual_cap * element_size);
    if (!new_vector->elements)
    {
        free(new_vector);
        return NULL;
    }

    new_vector->capacity = actual_cap;
    new_vector->element_size = element_size;
    new_vector->size = 0;

    return new_vector;
}

void DVectorDestroy(d_vector_t* vector)
{
    free(vector->elements);
    free(vector);
}

void* DVectorGetAccessToElement(const d_vector_t* vector, size_t index)
{
    assert(vector);

    if (index > vector->size)
    {
        index = vector->size;
    }

    return &(vector->elements[vector->element_size * index]);
}

int DVectorPushBack(d_vector_t* vector, const void* element)
{
    assert(vector);

    if (vector->size == vector->capacity)
    {
        while (DVectorReserve(vector, vector->capacity * RESIZE_FACTOR))
            ;
    }

    memmove(vector->elements + vector->element_size * vector->size, element,
            vector->element_size);

    ++vector->size;

    return 0;
}

void DVectorPopBack(d_vector_t* vector)
{
    if (vector->size)
    {
        --(vector->size);

        if (vector->size <= vector->capacity / SHRINK_CONDITION &&
            vector->capacity > DEFAULT_CAPACITY)
        {
            while (DVectorShrink(vector))
                ;
        }
    }
}

size_t DVectorSize(const d_vector_t* vector)
{
    return vector->size;
}

size_t DVectorCapacity(const d_vector_t* vector)
{
    return vector->capacity;
}

int DVectorReserve(d_vector_t* vector, size_t new_capacity)
{
    char* tmp = NULL;

    tmp =
        (char*) realloc(vector->elements, vector->element_size * new_capacity);
    if (!tmp)
    {
        return 1;
    }

    vector->elements = tmp;
    vector->capacity = new_capacity;
    tmp = NULL;

    return 0;
}

int DVectorShrink(d_vector_t* vector)
{
    char* tmp = NULL;
    size_t new_cap = (vector->capacity / SHRINK_CONDITION) > DEFAULT_CAPACITY
                         ? vector->capacity / SHRINK_CONDITION
                         : DEFAULT_CAPACITY;

    tmp = (char*) realloc(vector->elements, vector->element_size * new_cap);
    if (!tmp)
    {
        return 1;
    }

    vector->elements = tmp;
    vector->capacity = new_cap;
    tmp = NULL;

    return 0;
}
