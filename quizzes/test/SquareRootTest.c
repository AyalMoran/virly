/**************************************************************
 * File    : SquareRootTest.c
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

#include "SquareRoot.h"
#include "test_utils.h"

/******************************************************
 * START OF ACTUAL TESTS
 ******************************************************/

int main(void)
{
    float test_cases[] = {0.0f, 1.0f, 4.0f, 9.0f, 16.0f, 25.0f, 36.0f, 2.0f, 3.0f, 10.0f};
    size_t num_tests = sizeof(test_cases) / sizeof(test_cases[0]);
    size_t i = 0;
    float result = 0.0f;
    float expected = 0.0f;
    float diff = 0.0f;
    
    printf("Testing SquareRoot function:\n");
    printf("============================\n\n");
    
    for (i = 0; i < num_tests; ++i)
    {
        result = SquareRoot(test_cases[i]);
        expected = sqrtf(test_cases[i]);
        diff = result - expected;
        if (diff < 0.0f)
        {
            diff = -diff;
        }
        
        printf("Input: %.2f\n", test_cases[i]);
        printf("Result: %.6f\n", result);
        printf("Expected: %.6f\n", expected);
        printf("Difference: %.6f\n", diff);
        printf("---\n");
    }
    
    return 0;
}
