/******************
 Author : Ayal Moran
 Reviewer:  Lior
 Date: 26.03.25
 *****************/
#include <stdio.h>    /* printf */
#include <assert.h>   /* assert */
#include <string.h>   /* strcmp */

#include "bits_arr.h"

static void PrintBits(bits_arr_t array)
{
	int i = BITS_ARR_SIZE-1;
	for(; 0 <= i; --i)
	{
		printf("%d", BitsArrGetBit(array, i));

	}
	printf("\n\n");
	
}

/* Helper function to print test results */
static void PrintTestResult(const char* testName, int condition)
{
    if (condition)
    {
        printf("%s: PASSED\n", testName);
    }
    else
    {
        printf("%s: FAILED\n", testName);
    }
}

/* Test BitsArrSetBit and BitsArrGetBit */
static void TestBitsArrSetBit(void)
{
    bits_arr_t arr = 0;
    int result = 0;
    

    arr = BitsArrSetBit(arr, 0, 1);
    result = BitsArrGetBit(arr, 0);
    PrintTestResult("TestBitsArrSetBit(0, 1)", (1 == result));
    

    arr = BitsArrSetBit(arr, 1, 1);
    result = BitsArrGetBit(arr, 1);
    PrintTestResult("TestBitsArrSetBit(1, 1)", (1 == result));
    

    arr = BitsArrSetBit(arr, 1, 0);
    result = BitsArrGetBit(arr, 1);
    PrintTestResult("TestBitsArrSetBit(1, 0)", (0 == result));
    

    arr = 0;
    arr = BitsArrSetBit(arr, BITS_ARR_SIZE - 1, 1);
    result = BitsArrGetBit(arr, BITS_ARR_SIZE - 1);
    PrintTestResult("TestBitsArrSetBit(high_index, 1)",
                    (1 == result));
}

/* Test BitsArrSetOn, BitsArrSetOff, BitsArrFlip */
static void TestBitsArrBasicOps(void)
{
    bits_arr_t arr = 0;
    int bit = 0;
    
    /* Set bit at index 0 ON */
    arr = BitsArrSetOn(arr, 0);
    bit = BitsArrGetBit(arr, 0);
    PrintTestResult("TestBitsArrSetOn(0)", (1 == bit));
    
    /* Set bit at index 0 OFF */
    arr = BitsArrSetOff(arr, 0);
    bit = BitsArrGetBit(arr, 0);
    PrintTestResult("TestBitsArrSetOff(0)", (0 == bit));
    
    /* Flip bit at index 10 */
    arr = BitsArrFlip(arr, 10);
    bit = BitsArrGetBit(arr, 10);
    PrintTestResult("TestBitsArrFlip(10) - after flip on empty", (1 == bit));
    
    /* Flip bit at index 10 again */
    arr = BitsArrFlip(arr, 10);
    bit = BitsArrGetBit(arr, 10);
    PrintTestResult("TestBitsArrFlip(10) - flipping again", (0 == bit));
}

/* Test BitsArrSetAllOn, BitsArrSetAllOff, BitsArrCountOn, BitsArrCountOff */
static void TestBitsArrSetAllAndCount(void)
{
    bits_arr_t arr = 0;
    size_t count_on = 0;
    size_t count_off = 0;
    
    /* Set all bits ON */
    arr = BitsArrSetAllOn(arr);
    count_on = BitsArrCountOn(arr);
    count_off = BitsArrCountOff(arr);
    PrintTestResult("TestBitsArrSetAllOn - CountOn",
                    (BITS_ARR_SIZE == count_on));
    PrintTestResult("TestBitsArrSetAllOn - CountOff",
                    (0 == count_off));
    
    /* Set all bits OFF */
    arr = BitsArrSetAllOff(arr);
    count_on = BitsArrCountOn(arr);
    count_off = BitsArrCountOff(arr);
    PrintTestResult("TestBitsArrSetAllOff - CountOn",
                    (0 == count_on));
    PrintTestResult("TestBitsArrSetAllOff - CountOff",
                    (BITS_ARR_SIZE == count_off));
    
    /* sets */
    arr = BitsArrSetAllOff(arr); 
    arr = BitsArrSetOn(arr, 0);  
    arr = BitsArrSetOn(arr, 10); 
    count_on = BitsArrCountOn(arr);
    count_off = BitsArrCountOff(arr);
    PrintTestResult("TestBitsArrCountOn (2 bits on)",
                    (2 == count_on));
    PrintTestResult("TestBitsArrCountOff (2 bits on)",
                    (BITS_ARR_SIZE - 2 == count_off));
}

/* Test BitsArrRotateLeft, BitsArrRotateRight */
static void TestBitsArrRotate(void)
{
    bits_arr_t arr = 0;
    int bit = 0;
    

    arr = BitsArrSetOn(arr, 0);
    arr = BitsArrSetOn(arr, 1);
    arr = BitsArrRotateLeft(arr, 1);

    bit = BitsArrGetBit(arr, 1);
    PrintTestResult("BitsArrRotateLeft(1) - new bit at index 1", (1 == bit));
    bit = BitsArrGetBit(arr, 2);
    PrintTestResult("BitsArrRotateLeft(1) - new bit at index 2", (1 == bit));
    bit = BitsArrGetBit(arr, 0);
    PrintTestResult("BitsArrRotateLeft(1) - old bit at index 0", (0 == bit));
    

    arr = BitsArrRotateRight(arr, 1);
    bit = BitsArrGetBit(arr, 0);
    PrintTestResult("BitsArrRotateRight(1) - new bit at index 0", (1 == bit));
    bit = BitsArrGetBit(arr, 1);
    PrintTestResult("BitsArrRotateRight(1) - new bit at index 1", (1 == bit));
    bit = BitsArrGetBit(arr, 2);
    PrintTestResult("BitsArrRotateRight(1) - old bit at index 2", (0 == bit));
}

/* Test BitsArrMirror */
static void TestBitsArrMirror(void)
{
    bits_arr_t arr = 0;
    bits_arr_t mirrored = 0;
    int bit_original = 0;
    int bit_mirrored = 0;
    

    arr = BitsArrSetOn(arr, 0);
    arr = BitsArrSetOn(arr, 1);
    arr = BitsArrSetOn(arr, 5);

    printf("arr is %lu before mirroring\n" , arr);
    mirrored = BitsArrMirror(arr);
    printf("mirror is %lu after mirroring\n" , mirrored);
    
    bit_original = BitsArrGetBit(arr, 0);
    bit_mirrored = BitsArrGetBit(mirrored, BITS_ARR_SIZE - 1);
    printf("bit original is %d and bit mirrored is %d\n ", bit_original, bit_mirrored);
    PrintTestResult("BitsArrMirror - bit 0 => bit 63 (or high index)",
                    (bit_original == bit_mirrored));
    
    bit_original = BitsArrGetBit(arr, 1);
    bit_mirrored = BitsArrGetBit(mirrored, BITS_ARR_SIZE - 2);
    printf("bit original is %d and bit mirrored is %d\n ", bit_original, bit_mirrored);
    PrintTestResult("BitsArrMirror - bit 1 => bit 62 (or high index - 1)",
                    (bit_original == bit_mirrored));
    
    bit_original = BitsArrGetBit(arr, 5);
    bit_mirrored = BitsArrGetBit(mirrored, BITS_ARR_SIZE - 6);
    printf("bit original is %d and bit mirrored is %d\n ", bit_original, bit_mirrored);
    PrintTestResult("BitsArrMirror - bit 2 => bit 61 (or high index - 2)",
                    (bit_original == bit_mirrored));
}

/* Test BitsArrToString */
static void TestBitsArrToString(void)
{
    bits_arr_t arr = 0;
    char buffer[BITS_ARR_SIZE + 1];  
    char expected[BITS_ARR_SIZE + 1];
    size_t i = 0;

    arr = BitsArrSetBit(arr, 0, 1);
    printf("\n1:%lu\n", arr);
    arr = BitsArrSetBit(arr, 5, 1);
    printf("\n2:%lu\n", arr);
    arr = BitsArrSetBit(arr, BITS_ARR_SIZE-1, 1); 
    printf("\n3:%lu\n", arr);
    
    PrintBits(arr);
    BitsArrToString(arr, buffer);
    
   
    for (i = 0; i < BITS_ARR_SIZE; ++i)
    {
        expected[i] = '0';
    }

    expected[0] = '1';         
    expected[BITS_ARR_SIZE - 1 - 0] = '1'; 
    expected[BITS_ARR_SIZE - 1 - 5] = '1'; 
    expected[BITS_ARR_SIZE] = '\0';
    printf("BitsArrToString output :  %s\n", buffer);
    printf("BitsArrToString expected: %s\n", expected);
    
    PrintTestResult("BitsArrToString compare", (strcmp(buffer, expected) == 0));
}

int main(void)
{
    printf("=== Running Bits Array Tests ===\n\n");

    TestBitsArrSetBit();
    TestBitsArrBasicOps();
    TestBitsArrSetAllAndCount();
    TestBitsArrRotate();
    TestBitsArrMirror();
    TestBitsArrToString();
    
    printf("\n=== Tests Complete ===\n");
    return 0;
}
