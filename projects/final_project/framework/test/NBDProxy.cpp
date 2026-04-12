/**************************************************************
 * File    : NBDProxy.cpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    : 2026-03-24
 **************************************************************/

#include <stdexcept> // std::runtime_error
#include <string>    // std::string
#include <unistd.h>  // read

#include "FrameworkDemoCommon.hpp"
#include "NBDProxy.hpp"

namespace ilrd
{

ITask* NBDProxy::GetTask(int fd)
{
    std::string line;
    char ch = '\0';

    while (true)
    {
        const ssize_t bytes_read = read(fd, &ch, 1);
        if (bytes_read < 0)
        {
            throw std::runtime_error("NBDProxy read failed");
        }

        if (0 == bytes_read)
        {
            return nullptr;
        }

        if ('\n' == ch)
        {
            break;
        }

        line += ch;
    }

    if ("quit" == line)
    {
        return new demo::DemoTask(demo::QUIT_TASK);
    }

    static const std::string prefix("print:");
    if (0 == line.find(prefix))
    {
        return new demo::DemoTask(demo::PRINT_TASK,
                                  line.substr(prefix.length()));
    }

    return new demo::DemoTask(demo::PRINT_TASK, line);
}

} // namespace ilrd
