#ifndef _ILRD_FSQ_H_
#define _ILRD_FSQ_H_

#include <sys/types.h>/* ssize_t */

typedef struct fsq fsq_t;

typedef enum fsq_status
{
    FSQ_SUCCESS = 0,
    FSQ_FAILURE = 1,
    FSQ_SEM_WAIT_FAILURE = 2,
    FSQ_MUTEX_LOCK_FAILURE = 3,
    FSQ_MUTEX_UNLOCK_FAILURE = 4,
    FSQ_SEM_POST_FAILURE = 5
}fsq_status_t;

/**
 * @brief Create a new fixed size queue.
 *
 * Allocates and initializes a fixed size queue with the specified capacity.
 *
 * @param capacity The maximum number of items the queue can hold.
 *
 * @return Pointer to the created fsq_t queue, or NULL on failure.
 *
 * @note Time Complexity : O(1)
 * @note Space Complexity: O(capacity)
 */
fsq_t* FSQCreate(size_t capacity, size_t nconsumers);

/**
 * @brief Destroy a fixed size queue.
 *
 * Frees all resources associated with the given queue.
 *
 * @param fsq Pointer to the fsq_t queue to destroy.
 *
 * @return Status code indicating success or failure.
 *
 * @note Time Complexity : O(1)
 * @note Space Complexity: O(1)
 */
fsq_status_t FSQDestroy(fsq_t* fsq);

/**
 * @brief Enqueue an item into the fixed size queue.
 *
 * Adds an item to the end of the queue.
 *
 * @param q Pointer to the fsq_t queue.
 * @param item Pointer to the item to enqueue.
 *
 * @return Status code indicating success or failure (e.g., if the queue is full).
 *
 * @note Time Complexity : O(1)
 * @note Space Complexity: O(1)
 */
fsq_status_t FSQEnqueue(fsq_t* q, void* item);

/**
 * @brief Dequeue an item from the fixed size queue.
 *
 * Removes an item from the front of the queue and outputs it.
 *
 * @param q Pointer to the fsq_t queue.
 * @param item_out Address of a pointer to receive the dequeued item.
 *
 * @return Status code indicating success or failure (e.g., if the queue is empty).
 *
 * @note Time Complexity : O(1)
 * @note Space Complexity: O(1)
 */
fsq_status_t FSQDequeue(fsq_t* q, void** item_out);

/**
 * @brief Get the capacity of the fixed size queue.
 *
 * Returns the maximum number of items the queue can hold.
 *
 * @param fsq Pointer to the fsq_t queue.
 *
 * @return The capacity of the queue.
 *
 * @note Time Complexity : O(1)
 * @note Space Complexity: O(1)
 */
size_t FSQCapacity(const fsq_t* fsq);

#endif /* _ILRD_FSQ_H_ */
