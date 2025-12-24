#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "MinimumSubstringWindow.h"

int main()
{
    const char* s = "ADOBECODEBANC";
    const char* t = "ABC";
    char* result = MinimumSubstringWindow(s, t);

    if (result != NULL)
    {
        printf("Minimum window substring: %s\n", result);
        free(result);
    }
    else
    {
        printf("No valid window found.\n");
    }

    return 0;
}