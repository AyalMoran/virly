#include <dlfcn.h>
#include <stdio.h>
#include <time.h>
#include <unistd.h>
#include "dynso_test.h"

#define FAILURE (1)
#define SUCCESS (0)

typedef void* (*foo_t)(void*);

int main(int argc, char* argv[])
{
    foo_t foo = NULL;
    FILE* dl_handler = NULL;
    size_t i = 600;
    printf("opening\n");
    while(--i)
    {
        dl_handler = dlopen(argv[1], RTLD_LAZY);
        if (!dl_handler)
        {
            printf("couldnt open\n");
            return FAILURE;
        }
        *(void**) &foo = dlsym(dl_handler, argv[2]);
        foo(NULL);
        dlclose(dl_handler);
        sleep(1);
    }

    return SUCCESS;
}

