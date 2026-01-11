#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_CHAR 128
#include "MinimumSubstringWindow.h"

char* MinimumSubstringWindowIter(const char* s, const char* t)
{
    size_t i = 0;
    int sLen = strlen(s);
    int tLen = strlen(t);

    int left = 0;
    int right = 0;
    int formed = 0;
    int minLength = INT_MAX;
    int minStart = 0;

    /* Frequency maps for target and window characters */
    int targetFreq[MAX_CHAR] = {0};
    int windowFreq[MAX_CHAR] = {0};

    char rChar = '\0';
    char lChar = '\0';

    char* result = NULL;

    if (0 == tLen || 0 == sLen || sLen < tLen)
    {
        return "";
    }

    /* Count frequency of each character in t */
    for (i = 0; i < (size_t)tLen; ++i)
    {
        targetFreq[(unsigned char)t[i]]++;
    }

    /* Right pointer moves to expand the window */
    for (right = 0; right < sLen; ++right)
    {
        rChar = s[right];
        ++windowFreq[(unsigned char)rChar];

        /* If the current character is needed and its count in window is <= target count */
        if (0 < targetFreq[(unsigned char)rChar] && targetFreq[(unsigned char)rChar] >= windowFreq[(unsigned char)rChar])
        {
            ++formed;
        }

        /* Contract the window from the left when all characters from t are included */
        while (tLen == formed)
        {
            /* Update minimum window if the current one is smaller */
            if (minLength > right - left + 1)
            {
                minLength = right - left + 1;
                minStart = left;
            }

            lChar = s[left];
            --windowFreq[(unsigned char)lChar];

            /* If removing the left character breaks the valid window condition */
            if (0 < targetFreq[(unsigned char)lChar] && targetFreq[(unsigned char)lChar] > windowFreq[(unsigned char)lChar])
            {
                --formed;
            }

            /* Move left pointer to shrink the window */
            ++left;
        }
    }

    /* If no valid window was found */
    if (INT_MAX == minLength)
    {
        return "";
    }

    /* NOTE: The caller is responsible for freeing this memory to prevent leaks.
     */
    result = (char*) malloc((minLength + 1) * sizeof(char));
    if (result == NULL)
    {
        return NULL; 
    }
    strncpy(result, s + minStart, minLength);
    result[minLength] = '\0'; /* Add null terminator */

    return result;
}

char* MinimumSubstringWindowRec(const char* s, const char* t)
{
    
    return NULL;
}