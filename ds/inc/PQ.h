/******************
 Author : Ayal Moran
 Reviewer: Or Oved
 Date: 23.4.25
 *****************/
#ifndef __ILRD_PQ_H__
#define __ILRD_PQ_H__

#include <stddef.h> /* size_t */

typedef struct pq pq_t;
/**
 * @brief Creates a new empty priority queue.
 *
 * @param cmp_func  User defined comparison—
 *                  positive if `data1` is higher priority than `data2`,
 *                  zero     if priorities are equal,  
 *                  negative if `data1` is lower  priority than `data2`.
 *					
 *			  		-- FIFO stability is guaranteed, 
 *				 	   so FIFO order is preserved for equality.
 * 
 * @return Pointer to the new queue on success, `NULL` on allocation failure.
 *
 * @complexity Time: O(1)  Space: O(1)
 */
pq_t* PQCreate(int (*cmp_func)(const void* data1, const void* data2));

/**
 * @brief Destroys a priority queue and frees all associated resources.
 *
 * @param queue Pointer to the queue to destroy (must not be `NULL`).
 *
 * @complexity Time: O(n) where n is the number of elements  
 *             Space: O(1) (in addition to elements being freed)
 */
void PQDestroy(pq_t* queue);

/**
 * @brief Inserts a new element into the queue.
 *
 * @param queue Pointer to the queue.
 * @param data  Pointer to the element to insert.
 *
 * @return 0 on success, 1 on allocation failure.
 *
 * @note Element is stored by reference; PQ stores the pointer.
 *
 * @complexity Time: O(n)  Space: O(1)
 */
int PQEnqueue(pq_t* queue, void* data);

/**
 * @brief Removes and returns the highest-priority element.
 *
 * @param queue Pointer to the queue (must not be empty).
 *
 * @return Pointer to the removed element.
 *
 * @complexity Time: O(1)  Space: O(1)
 */
void* PQDequeue(pq_t* queue);

/**
 * @brief Returns (not removing) the highest priority element.
 *
 * @param queue Pointer to the queue (must not be empty).
 *
 * @return Pointer to the element at the front.
 *
 * @complexity Time: O(1)  Space: O(1)
 */
void* PQPeek(const pq_t* queue);

/**
 * @brief Checks whether the queue is empty.
 *
 * @param queue Pointer to the queue.
 *
 * @return Non-zero if empty, 0 otherwise.
 *
 * @complexity Time: O(1)  Space: O(1)
 */
int PQIsEmpty(const pq_t* queue);

/**
 * @brief Returns the number of elements currently.
 *
 * @param queue Pointer to the queue.
 *
 * @return Current element count.
 *
 * @complexity Time:	Time: O(n), where n is the number of elements in the list.
						Space: O(1)
 */
size_t PQSize(const pq_t* queue);

/**
 * @brief Removes the first element that matches a predicate.
 *
 * @param queue         Pointer to the queue.
 * @param is_match_func Function that returns non-zero when `data`
 *                      matches `param`.
 * @param param         Parameter passed to 'is_match_func'.
 *
 * @return Pointer to the removed element, or `NULL` if no match.
 *
 * @complexity Time: O(n)  Space: O(1)
 */
void* PQErase(pq_t* queue,
              int (*is_match_func)(const void* data, void* param),
              void* param);

/**
 * @brief Removes all elements, leaving the queue empty.
 *
 * @param queue Pointer to the queue.
 *
 * @complexity Time: O(n)  Space: O(1)
 */
void PQClear(pq_t* queue);

#endif /* __ILRD_PQ_H__ */
