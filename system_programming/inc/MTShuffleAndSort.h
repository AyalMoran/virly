/**************************************************************
 * File    : MTShuffleAndSort.h
 * Author  : Ayal Moran
 * Reviewer: Daniel N.
 * Date    :14-01-2026
 **************************************************************/
#ifndef _ILRD_MTSHUFFLEANDSORT_H
#define _ILRD_MTSHUFFLEANDSORT_H

typedef enum shuffle_sort_status
{
    SUCCESS = 0,
    ALLOC_FAILURE,
    THREAD_FAILURE
} shuffle_sort_status_t;

int ShuffleSortDictionary(size_t multiplier, size_t nthreads);

#endif /* _ILRD_MTSHUFFLEANDSORT_H */
