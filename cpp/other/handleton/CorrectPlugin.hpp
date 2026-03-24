#ifndef ILRD_CORRECT_PLUGIN_HPP
#define ILRD_CORRECT_PLUGIN_HPP

#include "ThreadPool.hpp"

namespace ilrd
{
    extern "C" ThreadPool* GetInstanceFromPlugin();
}

#endif // ILRD_CORRECT_PLUGIN_HPP