/**************************************************************
 * File    : Logger.cpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

#include "Logger.hpp"

#include <ctime>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <sstream>

#include <unistd.h>

#include "Singleton.hpp"

namespace ilrd
{

Logger::LogTask::LogTask(Type task_type, std::string formatted)
    : m_type(task_type), m_formattedLine(formatted)
{
}

Logger::OStreamSink::OStreamSink(std::ostream& out_stream)
    : m_outStream(out_stream)
{
}

void Logger::OStreamSink::Write(const std::string& formatted_line)
{
    m_outStream << formatted_line << '\n';
}

void Logger::OStreamSink::Flush()
{
    m_outStream.flush();
}

Logger::FdSink::FdSink(int fd) : m_fd(fd)
{
    if (0 > m_fd)
    {
        throw std::invalid_argument("Logger file descriptor must be non-negative");
    }
}

void Logger::FdSink::Write(const std::string& formatted_line)
{
    std::string output = formatted_line + '\n';
    const char *buffer = output.c_str();
    std::size_t bytes_left = output.size();

    while (0 < bytes_left)
    {
        const ssize_t bytes_written = write(m_fd, buffer, bytes_left);
        if (0 >= bytes_written)
        {
            throw std::runtime_error("Logger failed writing to file descriptor");
        }

        buffer += bytes_written;
        bytes_left -= static_cast<std::size_t>(bytes_written);
    }
}

void Logger::FdSink::Flush()
{
}

Logger& Logger::Instance()
{
    return *Singleton<Logger>::GetInstance();
}

Logger::Logger()
    : m_tasks(),
      m_sink(std::make_shared<OStreamSink>(std::clog)),
      m_worker(&Logger::WorkerLoop, this),
      m_sinkMutex(),
      m_flushMutex(),
      m_flushCond(),
      m_pendingTasks(0),
      m_acceptingLogs(true)
{
}

Logger::~Logger()
{
    Flush();

    {
        std::lock_guard<std::mutex> lock(m_flushMutex);
        m_acceptingLogs = false;
    }

    m_tasks.Push(LogTask(LogTask::Type::SHUTDOWN));

    if (m_worker.joinable())
    {
        m_worker.join();
    }
}

bool Logger::Log(const std::string& message, Level level)
{
    const std::string formatted_line = FormatLine(message, level);

    std::lock_guard<std::mutex> lock(m_flushMutex);
    if (!m_acceptingLogs)
    {
        return false;
    }

    ++m_pendingTasks;
    m_tasks.Push(LogTask(LogTask::Type::MESSAGE, formatted_line));
    return true;
}

bool Logger::Log(const char* message, Level level)
{
    return Log((nullptr != message) ? std::string(message) : std::string(),
               level);
}

void Logger::SetFd(int fd)
{
    SetSink(std::make_shared<FdSink>(fd));
}

void Logger::SetSink(std::shared_ptr<Sink> sink)
{
    if (!sink)
    {
        throw std::invalid_argument("Logger sink must not be null");
    }

    Flush();

    std::lock_guard<std::mutex> lock(m_sinkMutex);
    m_sink = sink;
}

void Logger::Flush()
{
    std::unique_lock<std::mutex> lock(m_flushMutex);
    m_flushCond.wait(lock, [this]() { return 0 == m_pendingTasks; });
    lock.unlock();

    std::lock_guard<std::mutex> sink_lock(m_sinkMutex);
    m_sink->Flush();
}

std::string Logger::FormatLine(const std::string& message, Level level)
{
    std::ostringstream oss;
    oss << BuildTimestamp() << " [" << LevelToString(level) << "] " << message;
    return oss.str();
}

std::string Logger::BuildTimestamp()
{
    std::time_t current_time = std::time(nullptr);
    std::tm broken_time = {};

#if defined(_POSIX_VERSION)
    localtime_r(&current_time, &broken_time);
#else
    std::tm* local_time = std::localtime(&current_time);
    if (nullptr != local_time)
    {
        broken_time = *local_time;
    }
#endif

    std::ostringstream oss;
    oss << std::setfill('0') << std::setw(2) << broken_time.tm_mday
        << std::setw(2) << (broken_time.tm_mon + 1)
        << std::setw(4) << (broken_time.tm_year + 1900) << " : "
        << std::setw(2) << broken_time.tm_hour << " : " << std::setw(2)
        << broken_time.tm_min << " : " << std::setw(2)
        << broken_time.tm_sec;
    return oss.str();
}

std::string Logger::LevelToString(Level level)
{
    switch (level)
    {
    case Level::DEBUG:
        return "DEBUG";
    case Level::INFO:
        return "INFO";
    case Level::WARNING:
        return "WARNING";
    case Level::ERROR:
        return "ERROR";
    }

    return "INFO";
}

void Logger::WorkerLoop()
{
    while (true)
    {
        LogTask task;
        m_tasks.Pop(task);

        if (LogTask::Type::SHUTDOWN == task.m_type)
        {
            std::lock_guard<std::mutex> sink_lock(m_sinkMutex);
            m_sink->Flush();
            break;
        }

        DrainTask(task);
    }
}

void Logger::DrainTask(const LogTask& task)
{
    {
        std::lock_guard<std::mutex> lock(m_sinkMutex);
        m_sink->Write(task.m_formattedLine);
    }

    std::lock_guard<std::mutex> lock(m_flushMutex);
    --m_pendingTasks;
    if (0 == m_pendingTasks)
    {
        m_flushCond.notify_all();
    }
}

} // namespace ilrd
