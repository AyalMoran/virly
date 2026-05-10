#include <arpa/inet.h>
#include <chrono>
#include <condition_variable>
#include <cctype>
#include <cstdint>
#include <iostream>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

#include <sys/socket.h>
#include <unistd.h>

#include "Framework.hpp"
#include "DebugLogger.hpp"
#include "Logger.hpp"
#include "commands/MasterCommands.hpp"
#include "identity/UUID.hpp"
#include "metadata/MasterMetadata.hpp"
#include "placement/RAIDManager.hpp"
#include "response/ResponseManager.hpp"
#include "serialization/Serializer.hpp"
#include "tasks/ConcreteTasks.hpp"
#include "transport/MinionProxy.hpp"
#include "transport/MinionResponseProxy.hpp"
#include "wire/WireProtocol.hpp"

namespace
{

using ilrd::Buffer;
using ilrd::Framework;
using ilrd::IInputProxy;
using ilrd::ITask;
using ilrd::UUID;
using ilrd::concrete::BuildMasterCommandMap;
using ilrd::concrete::ClearActiveMasterRuntime;
using ilrd::concrete::MasterMetadata;
using ilrd::concrete::MasterRuntime;
using ilrd::concrete::MinionProxy;
using ilrd::concrete::MinionResponseProxy;
using ilrd::concrete::RAIDManager;
using ilrd::concrete::ResponseManager;
using ilrd::wire::FLAG_HAS_PAYLOAD;
using ilrd::wire::MessageType;
using ilrd::wire::MessageV1;
using ilrd::wire::StatusCode;

struct SimOptions
{
    std::string m_masterBindIp = "127.0.0.1";
    std::uint16_t m_masterPort = 0;
    std::string m_minionIp = "127.0.0.1";
    std::uint16_t m_minionPort = 0;
    std::uint64_t m_offset = 128;
    std::chrono::milliseconds m_timeout{2000};
    std::vector<std::uint8_t> m_payload = {0xCA, 0xFE, 0xBA, 0xBE};
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

    sockaddr_in Address() const
    {
        sockaddr_in address = {};
        socklen_t address_len = sizeof(address);
        if (0 != getsockname(m_fd, reinterpret_cast<sockaddr*>(&address),
                             &address_len))
        {
            throw std::runtime_error("getsockname failed");
        }

        return address;
    }

  private:
    int m_fd;
};

class SyntheticMasterInputProxy : public IInputProxy
{
  public:
    ITask* GetTask(int fd) override
    {
        std::vector<std::uint8_t> bytes(4096, 0);
        const ssize_t bytes_read = recv(fd, bytes.data(), bytes.size(), 0);
        if (bytes_read <= 0)
        {
            return nullptr;
        }

        try
        {
            bytes.resize(static_cast<std::size_t>(bytes_read));
            Buffer buffer = ilrd::wire::MakeBuffer(bytes);
            MessageV1 message;
            message.Deserialize(buffer);
            return ilrd::concrete::BuildTaskFromWireMessage(message);
        }
        catch (const std::exception& error)
        {
            ilrd::Logger::Instance().Log(
                std::string("MasterSim dropped synthetic input: ") + error.what(),
                ilrd::Logger::Level::WARNING);
            return nullptr;
        }
    }
};

class CompletionCollector
{
  public:
    ResponseManager::CompletionCallback Callback()
    {
        return [this](const ResponseManager::ResponseCompletion& completion)
        {
            std::lock_guard<std::mutex> lock(m_mutex);
            m_completions.push_back(completion);
            m_condition.notify_all();
        };
    }

    bool WaitForCount(std::size_t count, std::chrono::milliseconds timeout)
    {
        std::unique_lock<std::mutex> lock(m_mutex);
        return m_condition.wait_for(
            lock, timeout,
            [this, count]()
            {
                return m_completions.size() >= count;
            });
    }

    ResponseManager::ResponseCompletion At(std::size_t index) const
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        return m_completions.at(index);
    }

  private:
    mutable std::mutex m_mutex;
    std::condition_variable m_condition;
    std::vector<ResponseManager::ResponseCompletion> m_completions;
};

void PrintUsage(const char* program_name)
{
    std::cerr
        << "usage: " << program_name
        << " --minion-port <port> [--minion-ip <ip>]"
           " [--master-bind-ip <ip>] [--master-port <port>]"
           " [--offset <n>] [--payload-hex <hex>] [--timeout-ms <n>]"
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

std::uint8_t HexValue(char ch)
{
    if ('0' <= ch && ch <= '9')
    {
        return static_cast<std::uint8_t>(ch - '0');
    }

    const char lowered = static_cast<char>(std::tolower(
        static_cast<unsigned char>(ch)));
    if ('a' <= lowered && lowered <= 'f')
    {
        return static_cast<std::uint8_t>(10 + lowered - 'a');
    }

    throw std::invalid_argument("payload contains non-hex character");
}

std::vector<std::uint8_t> ParsePayloadHex(const std::string& value)
{
    std::string compact;
    for (char ch : value)
    {
        if (!std::isspace(static_cast<unsigned char>(ch)) &&
            ':' != ch && '-' != ch && '_' != ch)
        {
            compact += ch;
        }
    }

    if (compact.empty() || 0 != (compact.size() % 2))
    {
        throw std::invalid_argument("payload hex must contain whole bytes");
    }

    std::vector<std::uint8_t> payload;
    payload.reserve(compact.size() / 2);
    for (std::size_t i = 0; i < compact.size(); i += 2)
    {
        payload.push_back(static_cast<std::uint8_t>(
            (HexValue(compact[i]) << 4) | HexValue(compact[i + 1])));
    }

    return payload;
}

std::string ToHex(const std::vector<std::uint8_t>& payload)
{
    static const char* digits = "0123456789abcdef";
    std::string out;
    out.reserve(payload.size() * 2);
    for (std::uint8_t byte : payload)
    {
        out += digits[(byte >> 4) & 0x0F];
        out += digits[byte & 0x0F];
    }

    return out;
}

SimOptions ParseArgs(int argc, char** argv)
{
    SimOptions options;

    for (int i = 1; i < argc; i += 2)
    {
        if (i + 1 >= argc)
        {
            throw std::invalid_argument("missing value for final argument");
        }

        const std::string flag(argv[i]);
        const std::string value(argv[i + 1]);

        if ("--master-bind-ip" == flag)
        {
            options.m_masterBindIp = value;
        }
        else if ("--master-port" == flag)
        {
            options.m_masterPort = ParsePort(value);
        }
        else if ("--minion-ip" == flag)
        {
            options.m_minionIp = value;
        }
        else if ("--minion-port" == flag)
        {
            options.m_minionPort = ParsePort(value);
        }
        else if ("--offset" == flag)
        {
            options.m_offset = std::stoull(value);
        }
        else if ("--payload-hex" == flag)
        {
            options.m_payload = ParsePayloadHex(value);
        }
        else if ("--timeout-ms" == flag)
        {
            options.m_timeout = std::chrono::milliseconds(std::stoull(value));
        }
        else
        {
            throw std::invalid_argument("unknown argument: " + flag);
        }
    }

    if (0 == options.m_minionPort)
    {
        throw std::invalid_argument("--minion-port is required and must be nonzero");
    }

    if (options.m_payload.empty())
    {
        throw std::invalid_argument("--payload-hex must be nonempty");
    }

    return options;
}

void SendMessage(int fd, const sockaddr_in& address, const MessageV1& message)
{
    Buffer buffer;
    message.Serialize(buffer);

    const ssize_t bytes_sent =
        sendto(fd, buffer.GetData(), buffer.GetSize(), 0,
               reinterpret_cast<const sockaddr*>(&address), sizeof(address));
    if (bytes_sent != static_cast<ssize_t>(buffer.GetSize()))
    {
        throw std::runtime_error("sendto failed");
    }
}

MessageV1 MakeWriteRequest(const UUID& request_id,
                            std::uint64_t offset,
                            const std::vector<std::uint8_t>& payload)
{
    MessageV1 request;
    request.header.message_type = MessageType::WRITE_REQ;
    request.header.SetFlag(FLAG_HAS_PAYLOAD);
    request.header.request_id = request_id;
    request.header.logical_offset = offset;
    request.header.operation_length = static_cast<std::uint32_t>(payload.size());
    request.header.payload_length = static_cast<std::uint32_t>(payload.size());
    request.payload = payload;
    return request;
}

MessageV1 MakeReadRequest(const UUID& request_id,
                           std::uint64_t offset,
                           std::uint32_t length)
{
    MessageV1 request;
    request.header.message_type = MessageType::READ_REQ;
    request.header.request_id = request_id;
    request.header.logical_offset = offset;
    request.header.operation_length = length;
    return request;
}

MessageV1 MakeFlushRequest(const UUID& request_id)
{
    MessageV1 request;
    request.header.message_type = MessageType::FLUSH_REQ;
    request.header.request_id = request_id;
    return request;
}

void AssertCompletionOk(const ResponseManager::ResponseCompletion& completion,
                        const UUID& expected_id,
                        MessageType expected_type)
{
    if (!(completion.request_id == expected_id))
    {
        throw std::runtime_error("completion request id mismatch");
    }

    if (completion.response_type != expected_type)
    {
        throw std::runtime_error("completion response type mismatch");
    }

    if (completion.status != StatusCode::OK ||
        completion.state != ResponseManager::State::COMPLETED)
    {
        throw std::runtime_error("completion status is not OK");
    }
}

void RunSimulation(const SimOptions& options)
{
    ILRD_DEBUG_LOG("MasterSim starting simulation run");
    UdpSocket master_minion_socket;
    UdpSocket synthetic_sender;
    UdpSocket synthetic_input;

    master_minion_socket.Bind(options.m_masterBindIp, options.m_masterPort);
    synthetic_sender.Bind(options.m_masterBindIp, 0);
    synthetic_input.Bind(options.m_masterBindIp, 0);

    ResponseManager response_manager;
    CompletionCollector collector;
    MinionProxy minion_proxy(master_minion_socket.Fd(), options.m_minionIp,
                             options.m_minionPort);
    MasterMetadata metadata;
    metadata.RegisterNode(UUID(), minion_proxy, static_cast<std::uint64_t>(-1));
    RAIDManager raid_manager(metadata);
    MasterRuntime runtime(raid_manager, response_manager, collector.Callback());

    std::shared_ptr<IInputProxy> synthetic_proxy(new SyntheticMasterInputProxy());
    std::shared_ptr<IInputProxy> response_proxy(
        new MinionResponseProxy(master_minion_socket.Fd(), options.m_minionIp,
                                options.m_minionPort, response_manager));

    Framework::ProxyMap proxy_map;
    proxy_map[ilrd::IListener::ModeAndFd(ilrd::IListener::READ,
                                         synthetic_input.Fd())] =
        synthetic_proxy;
    proxy_map[ilrd::IListener::ModeAndFd(ilrd::IListener::READ,
                                         master_minion_socket.Fd())] =
        response_proxy;

    Framework framework(proxy_map, BuildMasterCommandMap(runtime), "");
    ILRD_DEBUG_LOG("MasterSim constructed framework and runtime");
    std::thread runner([&framework]() { framework.Run(); });

    try
    {
        const UUID write_id;
        SendMessage(synthetic_sender.Fd(), synthetic_input.Address(),
                    MakeWriteRequest(write_id, options.m_offset, options.m_payload));
        if (!collector.WaitForCount(1, options.m_timeout))
        {
            throw std::runtime_error("timed out waiting for write completion");
        }
        const ResponseManager::ResponseCompletion write_completion = collector.At(0);
        AssertCompletionOk(write_completion, write_id, MessageType::WRITE_RESP);

        const UUID read_id;
        SendMessage(synthetic_sender.Fd(), synthetic_input.Address(),
                    MakeReadRequest(read_id, options.m_offset,
                                    static_cast<std::uint32_t>(
                                        options.m_payload.size())));
        if (!collector.WaitForCount(2, options.m_timeout))
        {
            throw std::runtime_error("timed out waiting for read completion");
        }
        const ResponseManager::ResponseCompletion read_completion = collector.At(1);
        AssertCompletionOk(read_completion, read_id, MessageType::READ_RESP);
        if (read_completion.payload != options.m_payload)
        {
            throw std::runtime_error("read payload does not match written payload");
        }

        const UUID flush_id;
        SendMessage(synthetic_sender.Fd(), synthetic_input.Address(),
                    MakeFlushRequest(flush_id));
        if (!collector.WaitForCount(3, options.m_timeout))
        {
            throw std::runtime_error("timed out waiting for flush completion");
        }
        const ResponseManager::ResponseCompletion flush_completion = collector.At(2);
        AssertCompletionOk(flush_completion, flush_id, MessageType::FLUSH_RESP);

        framework.Stop();
        runner.join();
        ClearActiveMasterRuntime();
        ILRD_DEBUG_LOG("MasterSim completed simulation run");

        std::cout << "MASTER_SIM_OK" << std::endl;
        std::cout << "offset=" << options.m_offset << std::endl;
        std::cout << "payload_hex=" << ToHex(options.m_payload) << std::endl;
        std::cout << "write_request=" << write_id.ToString() << std::endl;
        std::cout << "read_request=" << read_id.ToString() << std::endl;
        std::cout << "flush_request=" << flush_id.ToString() << std::endl;
        std::cout << "readback_hex=" << ToHex(read_completion.payload) << std::endl;
    }
    catch (...)
    {
        framework.Stop();
        if (runner.joinable())
        {
            runner.join();
        }
        ClearActiveMasterRuntime();
        throw;
    }
}

} // namespace

int main(int argc, char** argv)
{
    try
    {
        const std::string timestamp = ilrd::CurrentTimeForLogFileName();
        const std::string log_file = std::string(argv[0]) + "_" + timestamp + ".log";
        ilrd::InitializeDebugLogger(log_file.c_str());
        RunSimulation(ParseArgs(argc, argv));
        return 0;
    }
    catch (const std::exception& error)
    {
        ILRD_DEBUG_LOG_LEVEL(
            std::string("MasterSimMain fatal error: ") + error.what(),
            ilrd::Logger::Level::ERROR);
        PrintUsage(argv[0]);
        std::cerr << error.what() << std::endl;
        return 1;
    }
}
