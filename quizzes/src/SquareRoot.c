/**************************************************************
 * File    : SquareRoot.c
 * Author  : Ayal Moran
 * Reviewer: 
 * Date    : 
**************************************************************/

/*============================ INCLUDES ============================*/
#include <stddef.h>   /* size_t   */

#include "SquareRoot.h"

/*========================== DEFINITIONS ===========================*/

#define EPSILON          (1.0e-6f)
#define MAX_ITERATIONS   (20)

float SquareRoot(float number)
{
    typedef union
    {
        float          f;
        unsigned long  ul;   
    } sqrt_cast_t;

    float guess  = 0.0f;
    float prev   = 0.0f;
    size_t iter  = 0;
   	sqrt_cast_t vc = {0};
    
    vc.f  = number;
    vc.ul  = (vc.ul >> 1) + 0x1FBD5F5FUL;
    guess  = vc.f; 
    
   if (0.0f == number || 1.0f == number)
    {
        return number;
    }

    do
    {
        prev  = guess;
        guess = 0.5f * (prev + number / prev);
        ++iter;
    }
    while (   ((guess - prev > EPSILON) || (prev - guess > EPSILON))
           && (iter < MAX_ITERATIONS));

    return guess;
}
