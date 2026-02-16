#include "Net/Logger.hpp"

#include <cerrno>
#include <cstdio>
#include <cstring>
#include <ctime>
#include <iostream>
#include <sstream>

std::string Logger::BuildErrnoMessage(const std::string& prefix)
{
    std::ostringstream oss;
    oss << prefix << ": errno=" << errno << " (" << std::strerror(errno) << ")";
    return oss.str();
}

std::string Logger::BuildPrefix(const std::string& level)
{
    std::time_t now = std::time(NULL);
    struct tm* local = std::localtime(&now);

    char timeBuffer[32];
    if (local != NULL)
    {
        std::strftime(timeBuffer, sizeof(timeBuffer), "%Y-%m-%d %H:%M:%S", local);
    }
    else
    {
        snprintf(timeBuffer, sizeof(timeBuffer), "0000-00-00 00:00:00");
    }

    std::string prefix = "[";
    prefix += timeBuffer;
    prefix += "] [";
    prefix += level;
    prefix += "] ";
    return prefix;
}

void Logger::Info(const std::string& message)
{
#ifndef NET_DISABLE_LOGS
    std::cout << BuildPrefix("INFO") << message << std::endl;
#else
    (void)message;
#endif
}

void Logger::Error(const std::string& message)
{
#ifndef NET_DISABLE_LOGS
    std::cerr << BuildPrefix("ERROR") << message << std::endl;
#else
    (void)message;
#endif
}
