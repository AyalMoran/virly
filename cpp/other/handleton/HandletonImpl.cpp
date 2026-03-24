#include <iostream>
#define I_AM_THE_HANDLETON_IMPLEMENTER 1
#include "Handleton.hpp"
#include "ThreadPool.hpp"
#include "HandletonImpl.hpp"
#include "Handleton.hpp"


using namespace ilrd;


extern "C" void PrintHandleton()
{
    using namespace ilrd;

    std::cout << Handleton<ThreadPool>::GetInstance() << std::endl;
}

