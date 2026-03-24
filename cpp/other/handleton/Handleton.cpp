#include <iostream>
#include <dlfcn.h>
#include "Singleton.hpp"
#include "ThreadPool.hpp"

int main()
{
    using namespace ilrd;

    std::cout << Singleton<ThreadPool>::GetInstance() << std::endl;

    void* handle = dlopen("./plugin.so", RTLD_LAZY);
    if (!handle)
    {
        std::cerr << "dlopen failed: " << dlerror() << std::endl;
        return 1;
    }

    void (*print_singleton)() = (void (*)()) dlsym(handle, "PrintSingleton");
    if (!print_singleton)
    {
        std::cerr << "dlsym failed: " << dlerror() << std::endl;
        return 1;
    }

    print_singleton();
    dlclose(handle);

    return 0;
}