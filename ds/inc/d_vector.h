/*************************************
 *            Author: Ayal Moran      *
 *         Reviewer:   Yarden         *
 *           Date: 30March            *
 *************************************/
#ifndef _ILRD_D_VECTOR_H_
#define _ILRD_D_VECTOR_H_

#include <stddef.h>/*size_t*/

#define DEFAULT_CAPACITY (8)

typedef struct d_vector d_vector_t;
/**
 * @brief Creates a new dynamic vector.
 *
 * Allocates and initializes a dynamic vector with the specific capacity and
 * element size. The initial size is set to 0.
 *
 * @param capacity The number of elements to allocate space for.
 * @param element_size Size in bytes of each element.
 * @return A pointer to the newly created dynamic vector,
 * (NULL if allocation fails.)
 *
 * @note Time Complexity: O(1) in the average case.
 * @note Space Complexity: O(n) where n is the number of elements allocated.
 */
d_vector_t* DVectorCreate(size_t capacity, size_t element_size);

/**
 * @brief frees a vector.
 *
 * Frees all memory associated with the vector.
 *
 * @param vector Pointer to the vector to destroy.
 *
 * @note Time Complexity: O(1)
 * @note Space Complexity: O(1)
 */
void DVectorDestroy(d_vector_t* vector);

/**
 * @brief Provides access to an element in the vector.
 *
 * Returns a pointer to the element at the given index.
 * If the passed index is larger than the current vector size the function will
 * return the last element of the dynamic vector.
 *
 * @param vector Pointer to the vector.
 * @param index 0-based index of the element.
 * @return Pointer to the element at the specified index.
 *
 * @note Time Complexity: O(1)
 * @note Space Complexity: O(1)
 */
void* DVectorGetAccessToElement(const d_vector_t* vector, size_t index);

/**
 * @brief Adds an element to the end of the vector.
 *
 * Copies the element into the vector and resize the vector if necessary.
 *
 * @param vector Pointer to the vector.
 * @param element Pointer to the element to add.
 * @return 0 on success, or a non-zero error code if memory allocation fails.
 *
 * @note Time Complexity: O(1) amortized; O(n) in worst-case on resize.
 * @note Space Complexity: O(1) 
 */
int DVectorPushBack(d_vector_t* vector, const void* element);

/**
 * @brief Removes the last element from the vector.
 *
 * Decrements the size of the vector and shrinks the allocated memory if needed.
 *
 * @param vector Pointer to the vector.
 *
 * @note Time Complexity: O(1) amortized; may involve O(n) if shrinkage occurs.
 * @note Space Complexity: O(1)
 */
void DVectorPopBack(d_vector_t* vector);

/**
 * @brief Returns the number of elements in the vector.
 *
 * @param vector Pointer to the vector.
 * @return The current number of elements in the vector.
 *
 * @note Time Complexity: O(1)
 * @note Space Complexity: O(1)
 */
size_t DVectorSize(const d_vector_t* vector);

/**
 * @brief Returns the current capacity of the vector.
 *
 * @param vector Pointer to the vector.
 * @return The total number of elements the vector can hold without resizing.
 *
 * @note Time Complexity: O(1)
 * @note Space Complexity: O(1)
 */
size_t DVectorCapacity(const d_vector_t* vector);

/**
 * @brief Reserves additional capacity for the vector.
 *
 * Reallocates the vector's array to the new capacity.
 *
 * @param vector Pointer to the vector.
 * @param new_capacity The new  capacity to allocate.
 * @return 0 on success, or 1 if memory allocation fails.
 *
 * @note Time Complexity: O(n) where n is the current number of elements.
 * @note Space Complexity: O(n) for the new allocation.
 */
int DVectorReserve(d_vector_t* vector, size_t new_capacity);

/**
 * @brief Shrinks the dynamic vector's capacity.
 *
 * Reallocates the vector's internal array to a smaller capacity based on a shrink condition.
 *
 * @param vector Pointer to the vector.
 * @return 0 on success, or a 1 if memory allocation fails.
 *
 * @note Time Complexity: O(n) where n is the current number of elements.
 * @note Space Complexity: O(n) for the new allocation.
 */
int DVectorShrink(d_vector_t* vector);

#endif /* _ILRD_D_VECTOR_H_ */

