#include <arpa/inet.h>
#include <csignal>
#include <cstdint>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>
#include <vector>

#include <sys/socket.h>
#include <unistd.h>

#include "Framework.hpp"
#include "DebugLogger.hpp"
#include "Logger.hpp"
#include "commands/MasterCommands.hpp"
#include "metadata/MasterMetadata.hpp"
#include "nbd/NBDCommunicator.hpp"
#include "nbd/NBDProxy.hpp"
#include "placement/RAIDManager.hpp"
#include "response/ResponseManager.hpp"
#include "runtime/MasterRuntime.hpp"
#include "transport/MinionProxy.hpp"
#include "transport/MinionResponseProxy.hpp"

namespace
{

using ilrd::Framework;
using ilrd::IInputProxy;
using ilrd::UUID;
using ilrd::concrete::BuildMasterCommandMap;
using ilrd::concrete::ClearActiveMasterRuntime;
using ilrd::concrete::MasterMetadata;
using ilrd::concrete::MasterRuntime;
using ilrd::concrete::MinionProxy;
using ilrd::concrete::MinionResponseProxy;
using ilrd::concrete::NBDCommunicator;
using ilrd::concrete::NBDProxy;
using ilrd::concrete::RAIDManager;
using ilrd::concrete::ResponseManager;

struct MasterNBDOptions
{
    struct MinionEndpoint
    {
        std::string ip = "127.0.0.1";
        std::uint16_t port = 0;
        std::uint64_t capacityBytes = 0;
    };

    std::string m_nbdDevice;
    std::uint64_t m_deviceSizeBytes = 0;
    std::uint32_t m_blockSize = 4096;
    std::string m_masterBindIp = "127.0.0.1";
    std::uint16_t m_masterPort = 0;
    std::vector<MinionEndpoint> m_minions;
    std::string m_pluginsDir;
};

class UdpSocket
{
  public:
    UdpSocket() : m_fd(socket(AF_INET, SOCK_DGRAM, 0))
    {
        if (m_fd < 0)
        {
            throw std::runtime_error("socket failed");
        }
    }

    ~UdpSocket()
    {
        if (m_fd >= 0)
        {
            close(m_fd);
        }
    }

    int Fd() const
    {
        return m_fd;
    }

    void Bind(const std::string& ip, std::uint16_t port)
    {
        sockaddr_in address = {};
        address.sin_family = AF_INET;
        address.sin_port = htons(port);
        if (1 != inet_pton(AF_INET, ip.c_str(), &address.sin_addr))
        {
            throw std::invalid_argument("invalid IPv4 bind address: " + ip);
        }

        if (0 != bind(m_fd, reinterpret_cast<const sockaddr*>(&address),
                      sizeof(address)))
        {
            throw std::runtime_error("bind failed");
        }
    }

  private:
    int m_fd;
};

void PrintUsage(const char* program_name)
{
    std::cerr
        << "usage: " << program_name
        << " --nbd-device /dev/nbdX --device-size-bytes <n>"
           " --minion <ip:port:capacity> [--minion <ip:port:capacity> ...]"
           " [--master-bind-ip <ip>] [--master-port <port>]"
           " [--block-size <n>] [--plugins-dir <dir>]"
        << std::endl
        << "One minion starts single-node mode. Two or more minions use the "
           "hybrid RAID0+1 ring."
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

MasterNBDOptions::MinionEndpoint ParseEndpoint(const std::string& value)
{
    const std::size_t last_separator = value.rfind(':');
    if (std::string::npos == last_separator || 0 == last_separator ||
        last_separator + 1 >= value.size())
    {
        throw std::invalid_argument("invalid --minion endpoint: " + value);
    }

    const std::size_t second_separator = value.rfind(':', last_separator - 1);
    if (std::string::npos == second_separator || 0 == second_separator ||
        second_separator + 1 >= last_separator)
    {
        throw std::invalid_argument(
            "invalid --minion endpoint, expected ip:port:capacity: " + value);
    }

    MasterNBDOptions::MinionEndpoint endpoint;
    endpoint.ip = value.substr(0, second_separator);
    endpoint.port = ParsePort(
        value.substr(second_separator + 1,
                     last_separator - second_separator - 1));
    endpoint.capacityBytes = std::stoull(value.substr(last_separator + 1));
    if (0 == endpoint.capacityBytes)
    {
        throw std::invalid_argument(
            "minion capacity must be nonzero: " + value);
    }

    return endpoint;
}

MasterNBDOptions ParseArgs(int argc, char** argv)
{
    MasterNBDOptions options;
    std::string pending_minion_ip;

    for (int i = 1; i < argc; ++i)
    {
        const std::string flag(argv[i]);

        if ("--nbd-device" == flag)
        {
            if (i + 1 >= argc)
            {
                throw std::invalid_argument("missing value for --nbd-device");
            }

            options.m_nbdDevice = argv[++i];
        }
        else if ("--device-size-bytes" == flag)
        {
            if (i + 1 >= argc)
            {
                throw std::invalid_argument("missing value for --device-size-bytes");
            }

            options.m_deviceSizeBytes = std::stoull(argv[++i]);
        }
        else if ("--block-size" == flag)
        {
            if (i + 1 >= argc)
            {
                throw std::invalid_argument("missing value for --block-size");
            }

            options.m_blockSize =
                static_cast<std::uint32_t>(std::stoul(argv[++i]));
        }
        else if ("--master-bind-ip" == flag)
        {
            if (i + 1 >= argc)
            {
                throw std::invalid_argument("missing value for --master-bind-ip");
            }

            options.m_masterBindIp = argv[++i];
        }
        else if ("--master-port" == flag)
        {
            if (i + 1 >= argc)
            {
                throw std::invalid_argument("missing value for --master-port");
            }

            options.m_masterPort = ParsePort(argv[++i]);
        }
        else if ("--minion-ip" == flag)
        {
            if (i + 1 >= argc)
            {
                throw std::invalid_argument("missing value for --minion-ip");
            }

            pending_minion_ip = argv[++i];
        }
        else if ("--minion-port" == flag)
        {
            if (i + 1 >= argc)
            {
                throw std::invalid_argument("missing value for --minion-port");
            }

            MasterNBDOptions::MinionEndpoint endpoint;
            endpoint.ip = pending_minion_ip.empty() ? "127.0.0.1" : pending_minion_ip;
            endpoint.port = ParsePort(argv[++i]);
            if (i + 2 >= argc || std::string("--minion-capacity") != argv[i + 1])
            {
                throw std::invalid_argument(
                    "--minion-port requires a following --minion-capacity");
            }

            endpoint.capacityBytes = std::stoull(argv[i + 2]);
            if (0 == endpoint.capacityBytes)
            {
                throw std::invalid_argument(
                    "--minion-capacity must be nonzero");
            }

            options.m_minions.push_back(endpoint);
            pending_minion_ip.clear();
            i += 2;
        }
        else if ("--minion" == flag)
        {
            if (i + 1 >= argc)
            {
                throw std::invalid_argument("missing value for --minion");
            }

            options.m_minions.push_back(ParseEndpoint(argv[++i]));
        }
        else if ("--plugins-dir" == flag)
        {
            if (i + 1 >= argc)
            {
                throw std::invalid_argument("missing value for --plugins-dir");
            }

            options.m_pluginsDir = argv[++i];
        }
        else
        {
            throw std::invalid_argument("unknown argument: " + flag);
        }
    }

    if (options.m_nbdDevice.empty())
    {
        throw std::invalid_argument("--nbd-device is required");
    }

    if (0 == options.m_deviceSizeBytes)
    {
        throw std::invalid_argument("--device-size-bytes is required and must be nonzero");
    }

    if (!pending_minion_ip.empty())
    {
        throw std::invalid_argument("--minion-ip requires a matching --minion-port");
    }

    if (options.m_minions.empty())
    {
        throw std::invalid_argument("at least one minion is required");
    }

    return options;
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

void RunMasterNBD(const MasterNBDOptions& options)
{
    InstallSignalHandlers();
    ILRD_DEBUG_LOG("MasterNBDMain installed signal handlers");

    UdpSocket master_minion_socket;
    master_minion_socket.Bind(options.m_masterBindIp, options.m_masterPort);
    ILRD_DEBUG_LOG("MasterNBDMain bound master/minion UDP socket fd=" +
                   std::to_string(master_minion_socket.Fd()));

    MasterMetadata metadata;
    std::vector<std::unique_ptr<MinionProxy> > minion_proxies;
    std::vector<MinionResponseProxy::Endpoint> response_endpoints;
    for (std::size_t i = 0; i < options.m_minions.size(); ++i)
    {
        const MasterNBDOptions::MinionEndpoint& endpoint = options.m_minions[i];
        minion_proxies.push_back(std::unique_ptr<MinionProxy>(
            new MinionProxy(master_minion_socket.Fd(), endpoint.ip, endpoint.port)));
        response_endpoints.push_back(
            MinionResponseProxy::Endpoint(endpoint.ip, endpoint.port));
        metadata.RegisterNode(UUID(i + 1, 0, 0, 0),
                              *minion_proxies.back(),
                              endpoint.capacityBytes);
    }

    RAIDManager raid_manager(metadata);
    if (options.m_deviceSizeBytes > raid_manager.GetExposedCapacity())
    {
        throw std::invalid_argument(
            "--device-size-bytes exceeds exposed cluster capacity");
    }

    NBDCommunicator::Options nbd_options;
    nbd_options.device_path = options.m_nbdDevice;
    nbd_options.size_bytes = options.m_deviceSizeBytes;
    nbd_options.block_size = options.m_blockSize;
    std::unique_ptr<NBDCommunicator> communicator =
        NBDCommunicator::Connect(nbd_options);

    std::shared_ptr<NBDProxy> nbd_proxy(new NBDProxy(*communicator));
    std::shared_ptr<IInputProxy> nbd_input_proxy = nbd_proxy;
    ResponseManager response_manager;

    MasterRuntime runtime(
        raid_manager,
        response_manager,
        [nbd_proxy](const ResponseManager::ResponseCompletion& completion)
        {
            nbd_proxy->SendResponse(completion);
        });

    std::shared_ptr<IInputProxy> response_proxy(
        new MinionResponseProxy(master_minion_socket.Fd(), response_endpoints,
                                response_manager));

    Framework::ProxyMap proxy_map;
    proxy_map[ilrd::IListener::ModeAndFd(ilrd::IListener::READ,
                                         communicator->GetFd())] =
        nbd_input_proxy;
    proxy_map[ilrd::IListener::ModeAndFd(ilrd::IListener::READ,
                                         master_minion_socket.Fd())] =
        response_proxy;

    Framework framework(proxy_map, BuildMasterCommandMap(runtime),
                        options.m_pluginsDir);
    ILRD_DEBUG_LOG("MasterNBDMain constructed framework, runtime, and proxies");
    ILRD_DEBUG_LOG_LEVEL("Master NBD runtime starting on " +
                             options.m_nbdDevice,
                         ilrd::Logger::Level::INFO);
    framework.Run();
    ILRD_DEBUG_LOG("MasterNBDMain framework run completed");
    ClearActiveMasterRuntime();
}

} // namespace

int main(int argc, char** argv)
{
    try
    {   
        ilrd::InitializeDebugLogger(
            std::string(argv[0]) + "_" +
            ilrd::CurrentTimeForLogFileName() + ".log");
        RunMasterNBD(ParseArgs(argc, argv));
        return 0;
    }
    catch (const std::exception& error)
    {
        ILRD_DEBUG_LOG_LEVEL(
            std::string("MasterNBDMain fatal error: ") + error.what(),
            ilrd::Logger::Level::ERROR);
        PrintUsage(argv[0]);
        std::cerr << error.what() << std::endl;
        return 1;
    }
}
