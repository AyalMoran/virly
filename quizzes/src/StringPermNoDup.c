#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "StringPerm.h"

static void RecStringPermNoDup(char* str, size_t left, size_t right);
static void SwapChars(char* a, char* b);

void StringPermNoDup(char* str)
{
    assert(str);

    RecStringPermNoDup(str, 0, strlen(str) - 1);
}

static void RecStringPermNoDup(char* str, size_t left, size_t right)
{
    size_t i = 0;

    if (left == right)
    {
        printf("%s\n", str);
        return;
    }

    for (i = left; i <= right; ++i)
    {
            SwapChars((str + left), (str + i));
            RecStringPermNoDup(str, left + 1, right);
            SwapChars((str + left), (str + i));
            while (i < right && str[i] == str[i + 1])
            {
                ++i;
            }
    }
}

static void SwapChars(char* a, char* b)
{
    char temp = *a;
    *a = *b;
    *b = temp;
}
