#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "MinimumSubstringWindow.h"

int main(int argc, char* argv[])
{
    char* result = NULL;
    if (argc < 4)
    {
        printf("Usage: <string> <substring>");
    }
    if (strcmp(argv[3], "iter"))

        result = MinimumSubstringWindowIter(argv[1], argv[2]);
    else if (strcmp(argv[3], "rec"))
    {
        result = MinimumSubstringWindowRec(argv[1], argv[2]);
    }
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