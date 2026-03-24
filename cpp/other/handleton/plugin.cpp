#include <iostream>
#include "Singleton.hpp"
#include "ThreadPool.hpp"
#include "plugin.hpp"

extern "C" void PrintSingleton()
{
    using namespace ilrd;

    std::cout << Singleton<ThreadPool>::GetInstance() << std::endl;
}
