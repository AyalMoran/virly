/**************************************************************
 * File    : IsStringRotationTest.c
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "IsStringRotation.h"
#include "test_utils.h"

/******************************************************
 * START OF ACTUAL TESTS
 ******************************************************/

int main(void)
{
    const char* str1 = NULL;
    const char* str2 = NULL;
    int result = 0;
    
    /* Test case 1: ABCDAB and ABABCD - should return 2 */
    str1 = "ABCDAB";
    str2 = "ABABCD";
    result = IsStringRotation(str1, str2);
    printf("Test 1:\n");
    printf("  str1: %s\n", str1);
    printf("  str2: %s\n", str2);
    printf("  Result: %d\n", result);
    printf("  Expected: 2\n");
    printf("  %s\n\n", (result == 2) ? "PASS" : "FAIL");
    
    /* Test case 2: CDBA and ABCD - should return -1  */
    str1 = "CDBA";
    str2 = "ABCD";
    result = IsStringRotation(str1, str2);
    printf("Test 2:\n");
    printf("  str1: %s\n", str1);
    printf("  str2: %s\n", str2);
    printf("  Result: %d\n", result);
    printf("  Expected: -1\n");
    printf("  %s\n\n", (result == -1) ? "PASS" : "FAIL");
    
    /* Test case 3: ABCD and ABCDE - should return -1 */
    str1 = "ABCD";
    str2 = "ABCDE";
    result = IsStringRotation(str1, str2);
    printf("Test 3:\n");
    printf("  str1: %s\n", str1);
    printf("  str2: %s\n", str2);
    printf("  Result: %d\n", result);
    printf("  Expected: -1\n");
    printf("  %s\n\n", (result == -1) ? "PASS" : "FAIL");
    
    /* Test case 4: Same strings - should return 0 */
    str1 = "HELLO";
    str2 = "HELLO";
    result = IsStringRotation(str1, str2);
    printf("Test 4:\n");
    printf("  str1: %s\n", str1);
    printf("  str2: %s\n", str2);
    printf("  Result: %d\n", result);
    printf("  Expected: 0\n");
    printf("  %s\n\n", (result == 0) ? "PASS" : "FAIL");
    
    /* Test case 5: Rotation starting at index 1 */
    str1 = "ABCD";
    str2 = "BCDA";
    result = IsStringRotation(str1, str2);
    printf("Test 5:\n");
    printf("  str1: %s\n", str1);
    printf("  str2: %s\n", str2);
    printf("  Result: %d\n", result);
    printf("  Expected: 1\n");
    printf("  %s\n\n", (result == 1) ? "PASS" : "FAIL");
    
    return 0;
}
