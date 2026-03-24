/**************************************************************
 * File    : Logger.hpp
 * Author  : Ayal Moran
 * Reviewer: 
 * Date    : 
**************************************************************/
#ifndef ILRD_LOGGER_HPP
#define ILRD_LOGGER_HPP

#include <cstddef>
#include <condition_variable>
#include <iosfwd>
#include <memory>
#include <mutex>
#include <string>
#include <thread>

#include "WaitableQueue.hpp"

namespace ilrd
{

template <typename T>
class Singleton;

class Logger
{
  public:
    enum class Level
    {
        DEBUG,
        INFO,
        WARNING,
        ERROR
    };

    class Sink
    {
      public:
        virtual ~Sink() = default;
        virtual void Write(const std::string& formatted_line) = 0;
        virtual void Flush() = 0;
    };

    class OStreamSink : public Sink
    {
      public:
        explicit OStreamSink(std::ostream& out_stream);

        void Write(const std::string& formatted_line) override;
        void Flush() override;

      private:
        std::ostream& m_outStream;
    };

    class FdSink : public Sink
    {
      public:
        explicit FdSink(int fd);

        void Write(const std::string& formatted_line) override;
        void Flush() override;

      private:
        int m_fd;
    };

    static Logger& Instance();

    bool Log(const std::string& message, Level level = Level::INFO);
    bool Log(const char* message, Level level = Level::INFO);
    void SetFd(int fd);
    void SetSink(std::shared_ptr<Sink> sink);
    void Flush();

  private:
    friend class Singleton<Logger>;

    struct LogTask
    {
        enum class Type
        {
            MESSAGE,
            SHUTDOWN
        };

        LogTask(Type task_type = Type::MESSAGE,
                std::string formatted = std::string());

        Type m_type;
        std::string m_formattedLine;
    };

    Logger();
    ~Logger();
    Logger(const Logger&) = delete;
    Logger& operator=(const Logger&) = delete;

    static std::string FormatLine(const std::string& message, Level level);
    static std::string BuildTimestamp();
    static std::string LevelToString(Level level);

    void WorkerLoop();
    void DrainTask(const LogTask& task);

    WaitableQueue<LogTask> m_tasks;
    std::shared_ptr<Sink> m_sink;
    std::thread m_worker;
    std::mutex m_sinkMutex;
    std::mutex m_flushMutex;
    std::condition_variable m_flushCond;
    std::size_t m_pendingTasks;
    bool m_acceptingLogs;
};

} // namespace ilrd

#endif /* ILRD_LOGGER_HPP */
