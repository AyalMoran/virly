#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>

#include "shared_obj_ovr.h"

int main()
{
    void* handle;
    void (*foo_int)(int);

    handle = dlopen("./liboverload.so", RTLD_LAZY);
    if (!handle)
    {
        fprintf(stderr, "%s\n", dlerror());
        exit(EXIT_FAILURE);
    }

    *(void**)&foo_int = dlsym(handle, "_Z3fool");
    foo_int(42);

    dlclose(handle);
    return 0;
}