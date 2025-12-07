/**************************************************************
 * File    : Heap.c
 * Author  : Ayal Moran
 * Reviewer: 
 * Date    : 
**************************************************************/
#ifndef __HEAP_H__
#define __HEAP_H__

#include <stddef.h> /* size_t */

/*
*
 * @brief Comparison function used by the heap to order elements.
 *
 * @param data1 Pointer to the first element to compare.
 * @param data2 Pointer to the second element to compare.
 *
 * @return
 *   Integer less than, equal to, or greater than zero if data1 is found to be 
 *   less than, equal, or be greater than data2, respectively.
 * 
 *   (Convention: negative => data1 < data2, zero => data1 == data2,
 *   positive => data1 > data2.)
 *
 * @note Both pointers are expected to be valid and point to objects stored
 *       in the heap.
 */
typedef int (*heap_cmp_t)(const void* data1, const void* data2);

/*
*
 * @typedef heap_is_match_t
 * @brief Predicate function used to locate a matching element in the heap.
 *
 * @param data  Pointer to an element stored in the heap.
 * @param param User-provided parameter forwarded to the predicate.
 *
 * @return Non-zero if the element matches the provided parameter; zero otherwise.
 *
 * @note The predicate should not modify heap structure. Behavior is undefined
 *       for invalid (e.g., NULL) data pointers unless the implementation
 *       explicitly allows it.
 */
typedef int (*heap_is_match_t)(const void* data, void* param);

typedef struct heap heap_t;

/*
*
 * @brief
 *   Create a Heap.
 *
 *   @param cmp - Pointer to a comparison function used to order elements in
 *   the heap. (must be a valid pointer)
 *
 * @note
 *   Time: O(1)
 *
 *   Space: O(1)
 *
 * @return
 *   heap_t* - Pointer to a valid heap_t on success, NULL on failure.
 */
heap_t* HeapCreate(heap_cmp_t cmp);

/*
*
 * @brief
 *   Destroy the Heap and free all internal resources.
 *
 *   @param heap - Pointer to a heap created with HeapCreate.
 *   Must Not be NULL.
 *
 * @note
 *   Time: O(n)
 *
 *   Space: O(1)
 *
 * @return
 *   void
 */
void HeapDestroy(heap_t* heap);

/*
*
 * @brief
 *   Push data onto the Heap.
 *
 *   @param heap - Pointer to the heap, must not be NULL.
 *   @param data - Pointer to the data to insert. (may be NULL if user data
 *   semantics permit)
 *
 * @note
 *   Time: O(log n)
 *
 *   Space: O(log n)
 *
 * @return
 *   int - 0 on success, non-zero on failure (e.g., allocation failure).
 */
int HeapPush(heap_t* heap, void* data);

/*
*
 * @brief
 *   Return the top element of the Heap without removing it.
 *
 *   @param heap - Pointer to the heap, must not be NULL.
 *
 * @note
 *   Time: O(1)
 *
 *   Space: O(1)
 * 
 *   It is recommended to call HeapIsEmpty(`heap`) to verify the heap is not
 *   empty before calling this function.
 *
 * @return
 *   void* - Pointer to the top element's data, UB if `heap` is empty.
 */
void* HeapPeek(const heap_t* heap);

/*
*
 * @brief
 *   Remove the top element from the Heap.
 *
 *   @param heap - Pointer to the heap, must not be NULL.
 *
 * @note
 *   Time: O(log n)
 *
 *   Space: O(log n)
 *
 *   It is recommended to call HeapIsEmpty(`heap`) to verify the heap is not
 *   empty before calling this function.
 * 
 * @return
 *   void - UB if `heap` is empty.
 */
void HeapPop(heap_t* heap);

/*
*
 * @brief
 *   Check whether the Heap is empty.
 *
 *   @param heap - Pointer to the heap, must not be NULL.
 * @note
 *   Time: O(1)
 *
 *   Space: O(1)
 *
 * @return
 *   int - Non-zero (true) if the heap is empty, 0 (false) otherwise.
 */
int HeapIsEmpty(const heap_t* heap);

/*
*
 * @brief
 *   Return the number of elements currently stored in the Heap.
 *
 *   @param heap - Pointer to the heap, must not be NULL.
 *
 * @note
 *   Time: O(1)
 *
 *   Space: O(1)
 *
 * @return
 *   size_t - The number of elements in the heap.
 */
size_t HeapSize(const heap_t* heap);

/*
*
 * @brief
 *   Remove an element matching a user-provided predicate from the Heap.
 *
 *   This searches the heap for an element for which the callback returns a
 *   match, removes that element from the heap, restores heap order, and
 *   returns the data pointer.
 *
 *   @param heap - Pointer to the heap, must not be NULL.
 *   @param callback - Pointer to a match function called for each element.
 *   Should return non-zero when a match is found, must not be NULL.
 *   @param param - User-supplied parameter passed through to the callback.
 *
 * @note
 *   Time: O(n)
 *
 *   Space: O(1)
 *
 *   It is recommended to call HeapIsEmpty(`heap`) to verify the heap is not
 *   empty before calling this function.
 * 
 * @return
 *   void* - Pointer to the removed element's data on success, or NULL if no
 *   matching element was found.
 */
void* HeapRemove(heap_t* heap, heap_is_match_t callback, void* param);

#ifndef NDEBUG
void* HeapPeekAtIndex(const heap_t* heap, size_t index);
#endif /*NDEBUG*/

#endif /* __HEAP_H__ */
