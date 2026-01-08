/**************************************************************
 * File    : IsStringRotation.c
 * Author  : Ayal Moran
 * Reviewer: 
 * Date    : 
**************************************************************/

/*============================ INCLUDES ============================*/
#include <stddef.h>
#include <string.h>

#include "IsStringRotation.h"

/*========================== DEFINITIONS ===========================*/

int IsStringRotation(const char* str1, const char* str2) {
    size_t j = 0;
    size_t i = 0;
    
    size_t len = strlen(str1);
    if (len != strlen(str2)) 
    {
        return -1;
    }
    
    for (i = 0; i < len; ++i) 
    {
        for (j = 0; j < len; ++j) 
        {
            if (str1[(i + j) % len] != str2[j]) 
            {
                break;
            }
        }
        
        if (j == len)
        {
            return i;
        }
    }
    
    return -1;
}
