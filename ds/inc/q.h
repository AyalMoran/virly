/******************
 Author : Ayal Moran
 Reviewer: Yarden
 Date: 2.4.25
 *****************/
#ifndef _ILRD_Q_H
#define _ILRD_Q_H

typedef struct queue queue_t;

/**
 * @brief Creates a new queue.
 *
 * Allocates memory for a new queue and initializes its underlying single linked list.
 *
 * @return A pointer to the new queue, or NULL if allocation fails.
 *
 * @note Time Complexity: O(1)
 * @note Space Complexity: O(1)
 */
queue_t* QCreate(void);

/**
 * @brief Destroys a queue.
 *
 * Frees all resources allocated for the queue and its internal list.
 *
 * @param queue The queue to destory.
 *
 * @note Time Complexity: O(n), where n is the number of elements.
 * @note Space Complexity: O(1)
 */
void QDestroy(queue_t* queue);

/**
 * @brief Enqueues an element.
 *
 * Inserts the given data at the end of the queue.
 *
 * @param queue The queue where the data is to be inserted.
 * @param data  The data to add.
 *
 * @return 0 on success, non-zero if there was an error.
 *
 * @note Time Complexity: O(1)
 * @note Space Complexity: O(1)
 */
int QEnqueue(queue_t* queue, void* data);

/**
 * @brief Dequeues an element.
 *
 * Removes the element at the front of the queue.
 *
 * @param queue The queue to remove the front element from.
 *
 * @note Time Complexity: O(1)
 * @note Space Complexity: O(1)
 */
void QDequeue(queue_t* queue);

/**
 * @brief Peeks at the front element.
 *
 * Returns the data at the front of the queue without removing it.
 *
 * @param queue The queue to peek into.
 *
 * @return A pointer to the front element's data, or NULL if the queue is empty.
 *
 * @note Time Complexity: O(1)
 * @note Space Complexity: O(1)
 */
void* QPeek(const queue_t* queue);

/**
 * @brief Gets the number of elements in the queue.
 *
 * Counts how many elements are currently stored in the queue.
 *
 * @param queue The queue whose size is to be computed.
 *
 * @return The number of elements in the queue.
 *
 * @note Time Complexity: O(n)
 * @note Space Complexity: O(1)
 */
size_t QSize(const queue_t* queue);

/**
 * @brief Checks if the queue is empty.
 *
 * Determines whether there are any elements in the queue.
 *
 * @param queue The queue to check.
 *
 * @return Non-zero if the queue is empty, 0 otherwise.
 *
 * @note Time Complexity: O(1)
 * @note Space Complexity: O(1)
 */
int QIsEmpty(const queue_t* queue);

/**
 * @brief Appends one queue to another.
 *
 * Appends all elements from the source queue to the destination queue.
 *
 * @param dest The destination queue that will receive the elements.
 * @param src  The source queue whose elements are to be appended.
 *
 * @note Time Complexity: O(1)
 * @note Space Complexity: O(1)
 */
void QAppend(queue_t* dest, queue_t* src);

#endif /* _ILRD_Q_H */

