#include "HandletonImpl.hpp"
#include "CorrectPlugin.hpp"
#include "ThreadPool.hpp"

namespace ilrd
{
    extern "C" ThreadPool* GetInstanceFromPlugin()
    {
        return Handleton<ThreadPool>::GetInstance();
    }
}

