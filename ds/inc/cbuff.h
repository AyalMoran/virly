/******************
 Author : Ayal Moran
 Reviewer: Or Caraco
 Date: 06.04.24
 *****************/
#ifndef _ILRD_C_BUFFER_H_
#define _ILRD_C_BUFFER_H_

#include <sys/types.h> /* ssize_t */

typedef struct c_buffer c_buffer_t;

/**
 * @brief Create a Circular Buffer.
 *
 * Allocate memory for a new circular buffer and initializes it's fields
 *
 * @param capacity The capacity of the circuar buffer.
 * @return a pointer to a circular buffer
 * @note Time Complexity: O(1).
 * @note Space Complexity: O(n), where n is the capacity of the buffer.
 */
c_buffer_t* CBuffCreate(size_t capacity);

/**
 * @brief Destroys a circular buffer.
 *
 * Frees all resources allocated for the circular buffer.
 *
 * @param c_buffer The buffer to destroy.
 *
 * @note Time Complexity: O(1)
 * @note Space Complexity: O(1)
 */
void CBuffDestroy(c_buffer_t* c_buffer);

/**
 * @brief Write into the buffer.
 *
 * Write 'data_size' bytes to the circular buffer.
 *
 * @param c_buffer The circular buffer into which to write.
 * @param src A pointer to the source from which to write data into the buffer.
 * @param data_size The number of bytes to write into the buffer.
 *
 * @return The amount of bytes written into c_buffer, or -1 if there was an error.
 *
 * @note Time Complexity: O(n), where n is the data_size;
 * @note Space Complexity: O(1)
 */
ssize_t CBuffWrite(c_buffer_t* c_buffer ,const void* src ,size_t data_size);

/**
 * @brief Read from the buffer.
 *
 * Read 'data_size bytes from the circular buffer.
 *
 * @param c_buffer The circular buffer from which to read.
 * @param dest A pointer to the destination into which to read data from the buffer.
 * @param data_size The number of bytes to read from the buffer.
 *
 * @return The amount of bytes read from c_buffer, or -1 if there was an error.
 *
 * @note Time Complexity: O(n), where n is the data_size;
 * @note Space Complexity: O(1)
 */
ssize_t CBuffRead(c_buffer_t* c_buffer ,void* dest ,size_t data_size); 

/**
 * @brief Amount of free space in the circular buffer.
 *
 * Calculates the amount of free space in the circular buffer.
 *
 * @param c_buffer A pointer to the circular buffer to calculate.
 *
 * @return The amount of free space (in bytes) in c_buffer.
 *
 * @note Time Complexity: O(1)
 * @note Space Complexity: O(1)
 */
size_t CBuffFreeSpace(const c_buffer_t* c_buffer);

/**
 * @brief Is the circular buffer array empty
 *
 * Calculate if the circular buffer empty from contents.
 *
 * @param c_buffer A pointer to the circular buffer.
 *
 * @return A boolean int indicating if the buffer is empty (1) or not (0).
 *
 * @note Time Complexity: O(1)
 * @note Space Complexity: O(1)
 */
int CBuffIsEmpty(const c_buffer_t* c_buffer); 

/**
 * @brief The amount of used bytes in the circular buffer.
 *
 * Calculates the amount of used bytes in the circular buffer pointed to by c_buffer.
 *
 * @param c_buffer A pointer to the circular buffer.
 *
 * @return The amount of used bytes in the circular buffer.
 *
 * @note Time Complexity: O(1)
 * @note Space Complexity: O(1)
 */
size_t CBuffSize(const c_buffer_t* c_buffer);

#endif /* _ILRD_C_BUFFER_H_ */


