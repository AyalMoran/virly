/******************
 Author : Ayal Moran
 Reviewer:  Lior
 Date: 26.03.25
 *****************/
#include <assert.h> /* assert */

#include "bits_arr.h" /*BITS_ARR_SIZE*/

#define LUT_SIZE (16)

bits_arr_t BitsArrSetBit(bits_arr_t array, size_t index , size_t val)
{
	assert(index < BITS_ARR_SIZE && "Invalid Index in BitsArrSetBit");
	
  	return ((array & ~(1UL << index)) | (val << index));
}

int BitsArrGetBit(bits_arr_t array, size_t index)
{	
	assert(index < BITS_ARR_SIZE && "Invalid Index in BitsArrGetBit");
	
	return 0x1UL & (array >> index);
}

bits_arr_t BitsArrSetOn(bits_arr_t array, size_t index)
{
	assert(index < BITS_ARR_SIZE && "Invalid Index in BitsArrSetOn");
	
	return BitsArrSetBit(array, index, 1);
}

bits_arr_t BitsArrSetOff(bits_arr_t array, size_t index)
{
	assert(index < BITS_ARR_SIZE && "Invalid Index in BitsArrSetOff");
	
	return BitsArrSetBit(array, index, 0);
}

bits_arr_t BitsArrSetAllOn(bits_arr_t array)
{
	return array | ~array;
}

bits_arr_t BitsArrSetAllOff(__attribute ((unused)) bits_arr_t array)
{
	return 0;
}

bits_arr_t BitsArrFlip(bits_arr_t array, size_t index)
{
	assert(index < BITS_ARR_SIZE && "Invalid Index in BitsArrFlip");
	return array ^ (1 << index);
}

size_t BitsArrCountOn(bits_arr_t array)
{
	array -= (array >> 1)  & 0x5555555555555555;             
    array  = (array 	   & 0x3333333333333333);
    array += ((array >> 2) & 0x3333333333333333); 
    array  = (array + (array >> 4)) & 0x0f0f0f0f0f0f0f0f;        
    array *= array * 0x0101010101010101;
    array >>= 56;
    return array;
}

size_t BitsArrCountOff(bits_arr_t array)
{
	return BITS_ARR_SIZE - BitsArrCountOn(array);
}

bits_arr_t BitsArrRotateLeft(bits_arr_t array, size_t shift)
{
	shift &= (BITS_ARR_SIZE -1);
	
	return ((array << (shift))| (array >> (BITS_ARR_SIZE - (shift))));
}

bits_arr_t BitsArrRotateRight(bits_arr_t array, size_t shift)
{
	shift &= (BITS_ARR_SIZE -1);
	return ((array >> (shift)) | (array << (BITS_ARR_SIZE - shift)));
}

bits_arr_t BitsArrMirror(bits_arr_t array)
{
	bits_arr_t x = array;
	x = (((x & 0x5555555555555555) << 1 ) | ((x & 0xAAAAAAAAAAAAAAAA) >> 1));
	x = (((x & 0x3333333333333333) << 2 ) | ((x & 0xCCCCCCCCCCCCCCCC) >> 2));
	x = (((x & 0x0F0F0F0F0F0F0F0F) << 4 ) | ((x & 0xF0F0F0F0F0F0F0F0) >> 4));
	x = (((x & 0x00FF00FF00FF00FF) << 8 ) | ((x & 0xFF00FF00FF00FF00) >> 8));
	x = (((x & 0x0000FFFF0000FFFF) << 16) | ((x & 0xFFFF0000FFFF0000) >> 16));
	x = (((x & 0x00000000FFFFFFFF) << 32) | ((x & 0xFFFFFFFF00000000) >> 32));
 
    return x;
}

char* BitsArrToString(bits_arr_t array, char* dest)
{
	char* dest_runner = dest;
	int i = BITS_ARR_SIZE-1;

	for(; 0 <= i ; --i)
	{
		*dest_runner = ((char)(BitsArrGetBit(array, i) + '0'));
		++dest_runner;
	}
	*dest_runner = '\0';

	return dest;
}

bits_arr_t BitsArrMirrorUsingLUT(bits_arr_t array)
{
	static const bits_arr_t LUT[LUT_SIZE] = {0x0, 0x8, 0x4, 0xC, 0x2, 0xA, 0x6,
	 							   0xE, 0x1, 0x9, 0x5, 0xD, 0x3, 0xB, 0x7, 0xF};
	bits_arr_t result = 0;
	int i = 0;
	
	for(; i < LUT_SIZE; ++i)
	{
		result = (result << 4) | LUT[array & 0xF];
		array >>= 4;
	}
	
	return result;
}

bits_arr_t BitsArrCountOnUsingLUT(bits_arr_t array)
{
	static const bits_arr_t LUT[LUT_SIZE] = {0, 1, 1, 2, 1, 2, 2, 3,
	 										 1, 2, 2, 3, 2, 3, 3, 4};
	bits_arr_t result = 0;
	int i = 0;
	
	for(; i < LUT_SIZE; ++i)
	{
		result += LUT[array & 0xF];
		array >>= 4;
	}
	
	return result;
}
