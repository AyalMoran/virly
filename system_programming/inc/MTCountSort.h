/**************************************************************
 * File    : MTCountSort.h
 * Author  : Ayal Moran
 * Reviewer: Yohai S.
 * Date    : 11-1-2026
 **************************************************************/

#ifndef __MT_COUNT_SORT_H__
#define __MT_COUNT_SORT_H__

#include <stddef.h>

int MTCountSort(char arr[], size_t size, size_t threads, char** out);
int SortDictEx2(size_t nthreads, char** out, size_t* out_size);

#endif /* __MT_COUNT_SORT_H__ */
