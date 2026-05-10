#include "DebugLogger.hpp"

#ifndef NDEBUG

#include <cstdlib>
#include <ctime>
#include <cerrno>
#include <cstring>
#include <iomanip>
#include <filesystem>
#include <iostream>
#include <sstream>
#include <mutex>
#include <stdexcept>
#include <string>

#include <fcntl.h>
#include <unistd.h>

namespace ilrd
{

namespace
{

std::once_flag g_debugLoggerOnce;
int g_debugLogFd = -1;

std::tm CurrentLocalTime()
{
    const std::time_t now = std::time(nullptr);
    std::tm local_time = {};

#ifdef __linux__
    localtime_r(&now, &local_time);
#else
    local_time = *std::localtime(&now);
#endif

    return local_time;
}

std::string SanitizeProgramName(const std::string& program_name)
{
    const std::string file_name =
        std::filesystem::path(program_name).filename().string();
    std::string sanitized;
    sanitized.reserve(file_name.size());

    for (char ch : file_name)
    {
        if (('a' <= ch && ch <= 'z') ||
            ('A' <= ch && ch <= 'Z') ||
            ('0' <= ch && ch <= '9') ||
            '_' == ch || '-' == ch)
        {
            sanitized += ch;
        }
        else
        {
            sanitized += '_';
        }
    }

    return sanitized.empty() ? std::string("process") : sanitized;
}

std::filesystem::path ResolveLogRoot()
{
    if (const char* env_dir = std::getenv("ILRD_DEBUG_LOG_DIR"))
    {
        if ('\0' != env_dir[0])
        {
            return std::filesystem::path(env_dir);
        }
    }

    try
    {
        return std::filesystem::current_path() / "build" / "debug_logs";
    }
    catch (const std::exception&)
    {
    }

    return std::filesystem::temp_directory_path() / "ilrd_debug_logs";
}

std::filesystem::path BuildLogPath(const std::string& program_name)
{
    const std::tm local_time = CurrentLocalTime();
    std::ostringstream date_formatter;
    date_formatter << std::put_time(&local_time, "%d.%m.%Y");

    return ResolveLogRoot() / date_formatter.str() /
           (SanitizeProgramName(program_name) + ".log");
}

std::shared_ptr<Logger::Sink> BuildFallbackSink(const std::string& message)
{
    std::cerr << message << std::endl;
    return std::make_shared<Logger::OStreamSink>(std::cerr);
}

void CloseDebugLogFd()
{
    if (-1 != g_debugLogFd)
    {
        close(g_debugLogFd);
        g_debugLogFd = -1;
    }
}

} // namespace

std::string CurrentTimeForLogFileName()
{
    const std::tm local_time = CurrentLocalTime();
    std::ostringstream formatter;
    formatter << std::put_time(&local_time, "%d.%m.%Y_%H.%M.%S");
    return formatter.str();
}

void InitializeDebugLogger(const std::string& program_name)
{
    std::call_once(
        g_debugLoggerOnce,
        [&program_name]()
        {
            const std::filesystem::path log_path = BuildLogPath(program_name);
            std::error_code error_code;
            std::filesystem::create_directories(log_path.parent_path(),
                                                error_code);
            if (error_code)
            {
                Logger::Instance().SetSink(
                    BuildFallbackSink("Debug logger directory unavailable: " +
                                      log_path.parent_path().string() +
                                      " (" + error_code.message() + ")"));
                Logger::Instance().Log(
                    "Debug logger fell back to stderr for " + program_name,
                    Logger::Level::WARNING);
                return;
            }

            g_debugLogFd = open(log_path.c_str(),
                                O_CREAT | O_WRONLY | O_APPEND | O_CLOEXEC,
                                0644);
            if (-1 == g_debugLogFd)
            {
                Logger::Instance().SetSink(
                    BuildFallbackSink("Debug logger file unavailable: " +
                                      log_path.string() + " (" +
                                      ::strerror(errno) + ")"));
                Logger::Instance().Log(
                    "Debug logger fell back to stderr for " + program_name,
                    Logger::Level::WARNING);
                return;
            }

            std::atexit(&CloseDebugLogFd);
            Logger::Instance().SetFd(g_debugLogFd);
            Logger::Instance().Log(
                "Debug logger initialized for " + program_name +
                " at " + log_path.string(),
                Logger::Level::INFO);
        });
}

void DebugLog(const std::string& message, Logger::Level level)
{
    Logger::Instance().Log(message, level);
}

} // namespace ilrd

#endif
