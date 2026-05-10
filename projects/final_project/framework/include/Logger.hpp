/**************************************************************
 * File    : Logger.hpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/
/**
 * @file Logger.hpp
 * @brief Declares the asynchronous process-wide logger.
 */
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

/**
 * @brief Asynchronous singleton logger with pluggable output sinks.
 */
class Logger
{
  public:
    /**
     * @brief Severity levels supported by the logger.
     */
    enum class Level
    {
        DEBUG,
        INFO,
        WARNING,
        ERROR
    };

    /**
     * @brief Abstract sink interface that consumes formatted log lines.
     */
    class Sink
    {
      public:
        virtual ~Sink() = default;

        /**
         * @brief Writes a formatted line to the sink.
         * @param formatted_line Fully formatted log line.
         */
        virtual void Write(const std::string& formatted_line) = 0;

        /**
         * @brief Flushes any buffered output in the sink.
         */
        virtual void Flush() = 0;
    };

    /**
     * @brief Sink implementation that writes log lines to a C++ stream.
     */
    class OStreamSink : public Sink
    {
      public:
        /**
         * @brief Wraps an existing output stream.
         * @param out_stream Destination stream; ownership remains with caller.
         */
        explicit OStreamSink(std::ostream& out_stream);

        void Write(const std::string& formatted_line) override;
        void Flush() override;

      private:
        std::ostream& m_outStream;
    };

    /**
     * @brief Sink implementation that writes log lines to a file descriptor.
     */
    class FdSink : public Sink
    {
      public:
        /**
         * @brief Wraps an existing writable file descriptor.
         * @param fd Destination descriptor; ownership remains with caller.
         */
        explicit FdSink(int fd);

        void Write(const std::string& formatted_line) override;
        void Flush() override;

      private:
        int m_fd;
    };

    /**
     * @brief Returns the global logger instance.
     * @return Process-wide logger singleton.
     */
    static Logger& Instance();

    /**
     * @brief Queues a message for asynchronous logging.
     * @param message Message text to log.
     * @param level Severity to include in the formatted entry.
     * @return `true` if the message was accepted for logging.
     */
    bool Log(const std::string& message, Level level = Level::INFO);

    /**
     * @brief Overload for C string messages.
     * @param message Message text to log.
     * @param level Severity to include in the formatted entry.
     * @return `true` if the message was accepted for logging.
     */
    bool Log(const char* message, Level level = Level::INFO);

    /**
     * @brief Redirects output to a file descriptor-backed sink.
     * @param fd Writable file descriptor to use for future log output.
     */
    void SetFd(int fd);

    /**
     * @brief Replaces the active sink implementation.
     * @param sink Shared sink object used for future log output.
     */
    void SetSink(std::shared_ptr<Sink> sink);

    /**
     * @brief Blocks until all queued log messages are written.
     */
    void Flush();

  private:
    friend class Singleton<Logger>;

    /**
     * @brief Internal task pushed onto the logger worker queue.
     */
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
