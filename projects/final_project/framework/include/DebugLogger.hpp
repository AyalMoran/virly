/**
 * @file DebugLogger.hpp
 * @brief Declares debug-only logging helpers and convenience macros.
 */
#ifndef ILRD_DEBUG_LOGGER_HPP
#define ILRD_DEBUG_LOGGER_HPP

#include <string>

#include "Logger.hpp"

namespace ilrd
{

#ifndef NDEBUG
/**
 * @brief Builds a timestamp fragment suitable for log file names.
 * @return Timestamp string formatted for file-name use.
 */
std::string CurrentTimeForLogFileName();

/**
 * @brief Initializes the process-wide debug logger instance.
 * @param program_name Name used to derive the log file name.
 */
void InitializeDebugLogger(const std::string& program_name);

/**
 * @brief Writes a debug message through the shared logger.
 * @param message Message text to log.
 * @param level Severity to associate with the entry.
 */
void DebugLog(const std::string& message,
              Logger::Level level = Logger::Level::DEBUG);
#else
inline std::string CurrentTimeForLogFileName()
{
    return "";
}

inline void InitializeDebugLogger(const std::string&)
{
}

inline void DebugLog(const std::string&, Logger::Level = Logger::Level::DEBUG)
{
}
#endif

} // namespace ilrd

#ifndef NDEBUG
/**
 * @brief Logs a debug-level message in debug builds.
 */
#define ILRD_DEBUG_LOG(message) ::ilrd::DebugLog((message))

/**
 * @brief Logs a message with an explicit level in debug builds.
 */
#define ILRD_DEBUG_LOG_LEVEL(message, level) \
    ::ilrd::DebugLog((message), (level))
#else
#define ILRD_DEBUG_LOG(message) do { } while (false)
#define ILRD_DEBUG_LOG_LEVEL(message, level) do { } while (false)
#endif

#endif // ILRD_DEBUG_LOGGER_HPP
