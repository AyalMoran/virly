#include <arpa/inet.h>
#include <csignal>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>

#include <sys/socket.h>
#include <unistd.h>

#include "Framework.hpp"
#include "DebugLogger.hpp"
#include "Logger.hpp"
#include "transport/MasterProxy.hpp"
#include "commands/MinionCommands.hpp"
#include "runtime/MinionRuntime.hpp"
#include "storage/MinionStorageBackend.hpp"

namespace
{

struct MinionOptions
{
    std::string m_bindIp;
    std::uint16_t m_port = 0;
    std::string m_storagePath;
    std::uint64_t m_capacityBytes = 0;
    std::string m_pluginsDir;
};

void PrintUsage(const char* program_name)
{
    std::cerr << "usage: " << program_name
              << " --bind-ip <ip> --port <port> --storage-path <path>"
                 " --capacity-bytes <n> [--plugins-dir <dir>]"
              << std::endl;
}

std::uint16_t ParsePort(const std::string& value)
{
    const unsigned long parsed = std::stoul(value);
    if (parsed > 65535UL)
    {
        throw std::invalid_argument("port out of range");
    }

    return static_cast<std::uint16_t>(parsed);
}

std::uint64_t ParseCapacity(const std::string& value)
{
    return std::stoull(value);
}

MinionOptions ParseArgs(int argc, char** argv)
{
    MinionOptions options;

    for (int i = 1; i < argc; i += 2)
    {
        if (i + 1 >= argc)
        {
            throw std::invalid_argument("missing value for final argument");
        }

        const std::string flag(argv[i]);
        const std::string value(argv[i + 1]);

        if ("--bind-ip" == flag)
        {
            options.m_bindIp = value;
        }
        else if ("--port" == flag)
        {
            options.m_port = ParsePort(value);
        }
        else if ("--storage-path" == flag)
        {
            options.m_storagePath = value;
        }
        else if ("--capacity-bytes" == flag)
        {
            options.m_capacityBytes = ParseCapacity(value);
        }
        else if ("--plugins-dir" == flag)
        {
            options.m_pluginsDir = value;
        }
        else
        {
            throw std::invalid_argument("unknown argument: " + flag);
        }
    }

    if (options.m_bindIp.empty())
    {
        throw std::invalid_argument("--bind-ip is required");
    }

    if (0 == options.m_port)
    {
        throw std::invalid_argument("--port is required and must be nonzero");
    }

    if (options.m_storagePath.empty())
    {
        throw std::invalid_argument("--storage-path is required");
    }

    if (0 == options.m_capacityBytes)
    {
        throw std::invalid_argument("--capacity-bytes is required and must be nonzero");
    }

    return options;
}

int CreateAndBindUdpSocket(const MinionOptions& options)
{
    const int fd = socket(AF_INET, SOCK_DGRAM, 0);
    if (fd < 0)
    {
        throw std::runtime_error("socket creation failed");
    }

    try
    {
        const int reuse = 1;
        if (0 != setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse)))
        {
            throw std::runtime_error("setsockopt(SO_REUSEADDR) failed");
        }

        sockaddr_in address = {};
        address.sin_family = AF_INET;
        address.sin_port = htons(options.m_port);
        if (1 != inet_pton(AF_INET, options.m_bindIp.c_str(), &address.sin_addr))
        {
            throw std::invalid_argument("invalid IPv4 bind address");
        }

        if (0 != bind(fd, reinterpret_cast<const sockaddr*>(&address),
                      sizeof(address)))
        {
            throw std::runtime_error("bind failed");
        }
    }
    catch (...)
    {
        close(fd);
        throw;
    }

    return fd;
}

void OnSignal(int signal_number)
{
    (void)signal_number;
    ilrd::RequestFrameworkStop();
}

void InstallSignalHandlers()
{
    std::signal(SIGINT, &OnSignal);
    std::signal(SIGTERM, &OnSignal);
}

} // namespace

int main(int argc, char** argv)
{
    try
    {
        const std::string timestamp = ilrd::CurrentTimeForLogFileName();
        const std::string log_file = std::string(argv[0]) + "_" + timestamp + ".log";
        ilrd::InitializeDebugLogger(log_file.c_str());
        const MinionOptions options = ParseArgs(argc, argv);
        ILRD_DEBUG_LOG("MinionMain parsed command-line arguments");
        InstallSignalHandlers();
        ILRD_DEBUG_LOG("MinionMain installed signal handlers");

        const int socket_fd = CreateAndBindUdpSocket(options);
        ILRD_DEBUG_LOG("MinionMain bound UDP socket fd=" +
                       std::to_string(socket_fd));
        try
        {
            std::shared_ptr<ilrd::IInputProxy> proxy(
                new ilrd::concrete::MasterProxy(socket_fd));
            ilrd::concrete::MinionStorageBackend storage(
                options.m_storagePath, options.m_capacityBytes);
            ilrd::concrete::MinionRuntime runtime(
                storage, dynamic_cast<ilrd::concrete::MasterProxy&>(*proxy));

            ilrd::Framework::ProxyMap proxy_map;
            proxy_map[ilrd::IListener::ModeAndFd(ilrd::IListener::READ, socket_fd)] =
                proxy;

            ilrd::Framework framework(
                proxy_map,
                ilrd::concrete::BuildMinionCommandMap(runtime),
                options.m_pluginsDir);

            ILRD_DEBUG_LOG("MinionMain constructed framework and runtime");
            ILRD_DEBUG_LOG_LEVEL(
                "Minion runtime starting on " + options.m_bindIp + ":" +
                std::to_string(options.m_port),
                ilrd::Logger::Level::INFO);
            framework.Run();
            ILRD_DEBUG_LOG("MinionMain framework run completed");
            ilrd::concrete::ClearActiveMinionRuntime();
            close(socket_fd);
            return 0;
        }
        catch (...)
        {
            ILRD_DEBUG_LOG_LEVEL("MinionMain unwinding after runtime failure",
                                 ilrd::Logger::Level::ERROR);
            ilrd::concrete::ClearActiveMinionRuntime();
            close(socket_fd);
            throw;
        }
    }
    catch (const std::exception& error)
    {
        ILRD_DEBUG_LOG_LEVEL(std::string("MinionMain fatal error: ") + error.what(),
                             ilrd::Logger::Level::ERROR);
        PrintUsage(argv[0]);
        std::cerr << error.what() << std::endl;
        return 1;
    }
}
