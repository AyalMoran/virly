#include "App/CommandLineOptions.hpp"

#include <cstdlib>
#include <iostream>
#include <sstream>

std::string CommandLineOptions::GetString(int argc, char** argv,
                                          const std::string& flag,
                                          const std::string& defaultValue)
{
    int i = 0;
    for (i = 1; i < argc - 1; ++i)
    {
        if (flag == argv[i])
        {
            return argv[i + 1];
        }
    }
    return defaultValue;
}

int CommandLineOptions::GetInt(int argc, char** argv, const std::string& flag,
                               int defaultValue)
{
    std::string value = GetString(argc, argv, flag, "");
    if (value.empty())
    {
        return defaultValue;
    }

    std::istringstream iss(value);
    int number = defaultValue;
    iss >> number;
    if (iss.fail())
    {
        return defaultValue;
    }
    return number;
}

bool CommandLineOptions::HasFlag(int argc, char** argv, const std::string& flag)
{
    int i = 0;
    for (i = 1; i < argc; ++i)
    {
        if (flag == argv[i])
        {
            return true;
        }
    }
    return false;
}

void CommandLineOptions::PrintHelpIfRequested(int argc, char** argv,
                                              const std::string& usage)
{
    if (HasFlag(argc, argv, "--help") || HasFlag(argc, argv, "-h"))
    {
        std::cout << usage << std::endl;
        std::exit(0);
    }
}
