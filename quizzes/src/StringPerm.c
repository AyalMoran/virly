#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "StringPerm.h"

static void RecStringPerm(char* str, size_t left, size_t right);
static void SwapChars(char* a, char* b);

void StringPerm(char* str)
{
    assert(str);

    RecStringPerm(str, 0, strlen(str) - 1);
}

static void RecStringPerm(char* str, size_t left, size_t right)
{
    size_t i = 0;

    if (left == right + 1)
    {
        printf("%s\n", str);
        return;
    }

    for (i = left; i <= right; ++i)
    {
        SwapChars((str + left), (str + i));
        RecStringPerm(str, left + 1, right);
        SwapChars((str + left), (str + i));
    }
}

static void SwapChars(char* a, char* b)
{
    char temp = *a;
    *a = *b;
    *b = temp;
}
