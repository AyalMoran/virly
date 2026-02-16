#ifndef NET_LOGGER_HPP
#define NET_LOGGER_HPP

#include <string>

class Logger
{
  public:
    static void Info(const std::string& message);
    static void Error(const std::string& message);
    static std::string BuildErrnoMessage(const std::string& prefix);

  private:
    static std::string BuildPrefix(const std::string& level);
};

#ifdef NET_DISABLE_LOGS
#define LOG_INFO(message) ((void)0)
#define LOG_ERROR(message) ((void)0)
#else
#define LOG_INFO(message) Logger::Info(message)
#define LOG_ERROR(message) Logger::Error(message)
#endif

#endif // NET_LOGGER_HPP

