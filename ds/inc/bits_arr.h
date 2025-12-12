/*****************
Bits Array API
*****************/
/******************
 Author : Ayal Moran
 Reviewer:  Lior
 Date: 26.03.25
 *****************/
#ifndef _ILRD_BITS_ARR_H_
#define _ILRD_BITS_ARR_H_

#include <stddef.h>  /* size_t */
#include <limits.h> /*CHAR_BIT*/

#define BITS_ARR_SIZE (sizeof(bits_arr_t) * CHAR_BIT)

typedef size_t bits_arr_t;

/**
 * @brief Sets the bit at the specified index to the given value (0 or 1).
 * 
 * @param array The bit array.
 * @param index The index of the bit to set.
 * @param val The value to set the bit to (0 or 1).
 * @return The modified bit array.
 * @complexity Time: O(1), Space: O(1)
 */
bits_arr_t BitsArrSetBit(bits_arr_t array, size_t index , size_t val);

/**
 * @brief Gets the value of the bit at the specified index.
 * 
 * @param array The bit array.
 * @param index The index of the bit to get.
 * @return The value of the bit (0 or 1).
 * @complexity Time: O(1), Space: O(1)
 */
int BitsArrGetBit(bits_arr_t array, size_t index);

/**
 * @brief Sets the bit at the specified index to 1.
 * 
 * @param array The bit array.
 * @param index The index of the bit to set.
 * @return The modified bit array.
 * @complexity Time: O(1), Space: O(1)
 */
bits_arr_t BitsArrSetOn(bits_arr_t array, size_t index);

/**
 * @brief Sets the bit at the specified index to 0.
 * 
 * @param array The bit array.
 * @param index The index of the bit to set.
 * @return The modified bit array.
 * @complexity Time: O(1), Space: O(1)
 */
bits_arr_t BitsArrSetOff(bits_arr_t array, size_t index);

/**
 * @brief Sets all bits in the array to 1.
 * 
 * @param array The bit array.
 * @return The modified bit array with all bits set to 1.
 * @complexity Time: O(1), Space: O(1)
 */
bits_arr_t BitsArrSetAllOn(bits_arr_t array);

/**
 * @brief Sets all bits in the array to 0.
 * 
 * @param array The bit array.
 * @return The modified bit array with all bits set to 0.
 * @complexity Time: O(1), Space: O(1)
 */
bits_arr_t BitsArrSetAllOff(bits_arr_t array);

/**
 * @brief Flips the bit at the specified index (0 becomes 1, 1 becomes 0).
 * 
 * @param array The bit array.
 * @param index The index of the bit to flip.
 * @return The modified bit array.
 * @complexity Time: O(1), Space: O(1)
 */
bits_arr_t BitsArrFlip(bits_arr_t array, size_t index);

/**
 * @brief Counts the number of bits set to 1 in the array.
 * 
 * @param array The bit array.
 * @return The count of bits set to 1.
 * @complexity Time: O(1), Space: O(1)
 */
size_t BitsArrCountOn(bits_arr_t array);

/**
 * @brief Counts the number of bits set to 0 in the array.
 * 
 * @param array The bit array.
 * @return The count of bits set to 0.
 * @complexity Time: O(1), Space: O(1).
 */
size_t BitsArrCountOff(bits_arr_t array);

/**
 * @brief Rotates the bits in the array to the left by the specified number of positions.
 * 
 * @param array The bit array.
 * @param shift The number of positions to rotate.
 * @return The modified bit array after rotation.
 * @complexity Time: O(n) where n is shift, Space: O(1)
 */
bits_arr_t BitsArrRotateLeft(bits_arr_t array, size_t shift);

/**
 * @brief Rotates the bits in the array to the right by the specified number of positions.
 * 
 * @param array The bit array.
 * @param shift The number of positions to rotate.
 * @return The modified bit array after rotation.
 * @complexity Time: O(n) where n is shift, Space: O(1)
 */
bits_arr_t BitsArrRotateRight(bits_arr_t array, size_t shift);

/**
 * @brief Mirrors (reverses) the bits in the array.
 * 
 * @param array The bit array.
 * @return The modified bit array with bits reversed.
 * @complexity Time: O(1), Space: O(1) 
 */
bits_arr_t BitsArrMirror(bits_arr_t array);

/**
 * @brief Converts the bit array to a string representation.
 * 
 * @param array The bit array.
 * @param dest The destination buffer to store the string representation.
 * @return A pointer to the destination buffer containing the string representation.
 * @complexity Time: O(1), Space: O(1)
 */
char* BitsArrToString(bits_arr_t array, char* dest);

#endif /* _ILRD_BITS_ARR_H_ */
