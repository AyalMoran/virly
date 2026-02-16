#ifndef APP_COMMAND_LINE_OPTIONS_HPP
#define APP_COMMAND_LINE_OPTIONS_HPP

#include <string>

class CommandLineOptions
{
  public:
    static std::string GetString(int argc, char** argv, const std::string& flag,
                                 const std::string& defaultValue);
    static int GetInt(int argc, char** argv, const std::string& flag,
                      int defaultValue);
    static bool HasFlag(int argc, char** argv, const std::string& flag);
    static void PrintHelpIfRequested(int argc, char** argv,
                                     const std::string& usage);
};

#endif
