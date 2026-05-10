#include <arpa/inet.h>
#include <chrono>
#include <condition_variable>
#include <csignal>
#include <cstdlib>
#include <filesystem>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

#include <sys/socket.h>
#include <sys/wait.h>
#include <unistd.h>

#include "Framework.hpp"
#include "commands/MasterCommands.hpp"
#include "identity/UUID.hpp"
#include "metadata/MasterMetadata.hpp"
#include "placement/RAIDManager.hpp"
#include "response/ResponseManager.hpp"
#include "serialization/Serializer.hpp"
#include "tasks/ConcreteTasks.hpp"
#include "transport/IMinionProxy.hpp"
#include "transport/MinionProxy.hpp"
#include "transport/MinionResponseProxy.hpp"
#include "wire/WireProtocol.hpp"
#include "test_utils.hpp"

namespace
{

using ilrd::Buffer;
using ilrd::Framework;
using ilrd::IInputProxy;
using ilrd::ITask;
using ilrd::SharedPtr;
using ilrd::UUID;
using ilrd::concrete::BuildMasterCommandMap;
using ilrd::concrete::ClearActiveMasterRuntime;
using ilrd::concrete::FlushTask;
using ilrd::concrete::IMinionProxy;
using ilrd::concrete::MasterFlushCommand;
using ilrd::concrete::MasterMetadata;
using ilrd::concrete::MasterReadCommand;
using ilrd::concrete::MasterRuntime;
using ilrd::concrete::MasterWriteCommand;
using ilrd::concrete::MinionProxy;
using ilrd::concrete::MinionResponseProxy;
using ilrd::concrete::RAIDManager;
using ilrd::concrete::READ_COMMAND_KEY;
using ilrd::concrete::ReadTask;
using ilrd::concrete::ResponseManager;
using ilrd::concrete::WRITE_COMMAND_KEY;
using ilrd::concrete::WriteTask;
using ilrd::wire::FLAG_HAS_PAYLOAD;
using ilrd::wire::MessageType;
using ilrd::wire::MessageV1;
using ilrd::wire::StatusCode;

class MockMinionProxy : public IMinionProxy
{
  public:
    bool fail_send = false;
    MessageType last_sent_type = MessageType::READ_REQ;
    UUID last_request_id = UUID(0, 0, 0, 0);
    std::uint64_t last_offset = 0;
    std::uint32_t last_length = 0;
    std::vector<std::uint8_t> last_payload;
    std::size_t send_count = 0;
    std::vector<MessageType> sent_types;
    std::vector<UUID> sent_request_ids;
    std::vector<std::uint64_t> sent_offsets;
    std::vector<std::vector<std::uint8_t> > sent_payloads;

    UUID SendReadRequest(std::uint64_t offset,
                         std::uint32_t length,
                         const UUID& request_id) override
    {
        MaybeFail();
        ++send_count;
        last_sent_type = MessageType::READ_REQ;
        last_request_id = request_id;
        last_offset = offset;
        last_length = length;
        last_payload.clear();
        sent_types.push_back(last_sent_type);
        sent_request_ids.push_back(request_id);
        sent_offsets.push_back(offset);
        sent_payloads.push_back(last_payload);
        return request_id;
    }

    UUID SendWriteRequest(std::uint64_t offset,
                          const std::vector<std::uint8_t>& payload,
                          const UUID& request_id) override
    {
        MaybeFail();
        ++send_count;
        last_sent_type = MessageType::WRITE_REQ;
        last_request_id = request_id;
        last_offset = offset;
        last_length = static_cast<std::uint32_t>(payload.size());
        last_payload = payload;
        sent_types.push_back(last_sent_type);
        sent_request_ids.push_back(request_id);
        sent_offsets.push_back(offset);
        sent_payloads.push_back(payload);
        return request_id;
    }

    UUID SendFlushRequest(const UUID& request_id) override
    {
        MaybeFail();
        ++send_count;
        last_sent_type = MessageType::FLUSH_REQ;
        last_request_id = request_id;
        last_offset = 0;
        last_length = 0;
        last_payload.clear();
        sent_types.push_back(last_sent_type);
        sent_request_ids.push_back(request_id);
        sent_offsets.push_back(0);
        sent_payloads.push_back(last_payload);
        return request_id;
    }

    UUID SendHeartbeatRequest(const UUID& node_id,
                              std::uint64_t heartbeat_seq,
                              ilrd::wire::HealthState health_state,
                              const UUID& request_id) override
    {
        (void)node_id;
        (void)heartbeat_seq;
        (void)health_state;
        MaybeFail();
        ++send_count;
        last_sent_type = MessageType::HEARTBEAT_REQ;
        last_request_id = request_id;
        return request_id;
    }

    bool ReceiveResponse(MessageV1& out,
                         std::chrono::milliseconds timeout) override
    {
        (void)out;
        (void)timeout;
        return false;
    }

  private:
    void MaybeFail() const
    {
        if (fail_send)
        {
            throw std::runtime_error("mock send failure");
        }
    }
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
        catch (...)
        {
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

    std::size_t Count() const
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        return m_completions.size();
    }

  private:
    mutable std::mutex m_mutex;
    std::condition_variable m_condition;
    std::vector<ResponseManager::ResponseCompletion> m_completions;
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

    void BindLoopback(std::uint16_t port = 0)
    {
        sockaddr_in address = {};
        address.sin_family = AF_INET;
        address.sin_port = htons(port);
        address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);

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

    std::uint16_t Port() const
    {
        return ntohs(Address().sin_port);
    }

  private:
    int m_fd;
};

class TempBackingFile
{
  public:
    explicit TempBackingFile(const std::string& stem)
        : m_path(std::filesystem::temp_directory_path() /
                 (stem + "_" + std::to_string(::getpid()) + ".bin"))
    {
        std::filesystem::remove(m_path);
    }

    ~TempBackingFile()
    {
        std::error_code error;
        std::filesystem::remove(m_path, error);
    }

    std::string PathName() const
    {
        return m_path.string();
    }

  private:
    std::filesystem::path m_path;
};

std::string MinionBinaryPath()
{
    const char* path = std::getenv("ILRD_MINION_BINARY");
    if (nullptr == path || '\0' == path[0])
    {
        return "build/minion";
    }

    return path;
}

std::uint16_t ReserveUdpPort()
{
    UdpSocket socket;
    socket.BindLoopback();
    return socket.Port();
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

void TestBuildMasterCommandMap()
{
    INIT_SUITE(suite, "Build Master Command Map");
    BEGIN_SUITE(suite);

    MockMinionProxy proxy;
    RAIDManager raid_manager(proxy);
    ResponseManager response_manager;
    MasterRuntime runtime(raid_manager, response_manager);
    const Framework::CommandMap command_map = BuildMasterCommandMap(runtime);

    ASSERT_EQ(suite, 3u, command_map.size());
    ASSERT_TRUE(suite, command_map.end() != command_map.find(READ_COMMAND_KEY));
    ASSERT_TRUE(suite, command_map.end() != command_map.find(WRITE_COMMAND_KEY));
    ASSERT_TRUE(suite, command_map.end() != command_map.find(ilrd::concrete::FLUSH_COMMAND_KEY));
    ClearActiveMasterRuntime();

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestMasterWriteCommandSends()
{
    INIT_SUITE(suite, "Master Write Command Sends");
    BEGIN_SUITE(suite);

    MockMinionProxy proxy;
    RAIDManager raid_manager(proxy);
    ResponseManager response_manager;
    MasterRuntime runtime(raid_manager, response_manager);
    BuildMasterCommandMap(runtime);

    const UUID request_id(1, 2, 3, 4);
    const std::vector<std::uint8_t> payload = {0x01, 0x02, 0x03};
    std::unique_ptr<ITask> task(
        new WriteTask(MakeWriteRequest(request_id, 64, payload).header, payload));

    MasterWriteCommand command;
    command.Execute(SharedPtr<ITask>(task.release()));

    ASSERT_EQ(suite, static_cast<int>(MessageType::WRITE_REQ),
              static_cast<int>(proxy.last_sent_type));
    ASSERT_TRUE(suite, proxy.last_request_id == request_id);
    ASSERT_EQ(suite, 64ULL, proxy.last_offset);
    ASSERT_EQ(suite, payload.size(), proxy.last_payload.size());
    ASSERT_EQ(suite, 1u, response_manager.PendingCount());
    ClearActiveMasterRuntime();

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestWrongTaskTypeDoesNotSend()
{
    INIT_SUITE(suite, "Master Read Command Rejects Wrong Task");
    BEGIN_SUITE(suite);

    MockMinionProxy proxy;
    RAIDManager raid_manager(proxy);
    ResponseManager response_manager;
    MasterRuntime runtime(raid_manager, response_manager);
    BuildMasterCommandMap(runtime);

    std::unique_ptr<ITask> task(
        new FlushTask(MakeFlushRequest(UUID(2, 3, 4, 5)).header));

    MasterReadCommand command;
    command.Execute(SharedPtr<ITask>(task.release()));

    ASSERT_EQ(suite, 0u, response_manager.PendingCount());
    ClearActiveMasterRuntime();

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestSendFailureCompletes()
{
    INIT_SUITE(suite, "Master Command Send Failure Completes");
    BEGIN_SUITE(suite);

    MockMinionProxy proxy;
    proxy.fail_send = true;
    RAIDManager raid_manager(proxy);
    ResponseManager response_manager;
    CompletionCollector collector;
    MasterRuntime runtime(raid_manager, response_manager, collector.Callback());
    BuildMasterCommandMap(runtime);

    const UUID request_id(3, 4, 5, 6);
    std::unique_ptr<ITask> task(
        new ReadTask(MakeReadRequest(request_id, 100, 8).header));

    MasterReadCommand command;
    command.Execute(SharedPtr<ITask>(task.release()));

    ASSERT_EQ(suite, 0u, response_manager.PendingCount());
    ASSERT_EQ(suite, 1u, collector.Count());
    const ResponseManager::ResponseCompletion completion = collector.At(0);
    ASSERT_TRUE(suite, completion.request_id == request_id);
    ASSERT_EQ(suite, static_cast<int>(ResponseManager::State::FAILED),
              static_cast<int>(completion.state));
    ASSERT_EQ(suite, static_cast<int>(StatusCode::UNAVAILABLE),
              static_cast<int>(completion.status));
    ClearActiveMasterRuntime();

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

MessageV1 MakeReadResponse(const UUID& request_id,
                            std::uint64_t offset,
                            const std::vector<std::uint8_t>& payload,
                            StatusCode status = StatusCode::OK)
{
    MessageV1 response;
    response.header.message_type = MessageType::READ_RESP;
    response.header.SetFlag(ilrd::wire::FLAG_RESPONSE);
    response.header.status_code = status;
    response.header.request_id = request_id;
    response.header.logical_offset = offset;
    response.header.operation_length = static_cast<std::uint32_t>(payload.size());
    response.header.payload_length = static_cast<std::uint32_t>(payload.size());
    response.header.SetFlag(FLAG_HAS_PAYLOAD, !payload.empty());
    response.payload = payload;
    return response;
}

MessageV1 MakeWriteResponse(const UUID& request_id,
                             std::uint64_t offset,
                             std::uint32_t length,
                             StatusCode status = StatusCode::OK)
{
    MessageV1 response;
    response.header.message_type = MessageType::WRITE_RESP;
    response.header.SetFlag(ilrd::wire::FLAG_RESPONSE);
    response.header.status_code = status;
    response.header.request_id = request_id;
    response.header.logical_offset = offset;
    response.header.operation_length = length;
    return response;
}

MessageV1 MakeFlushResponse(const UUID& request_id,
                            StatusCode status = StatusCode::OK)
{
    MessageV1 response;
    response.header.message_type = MessageType::FLUSH_RESP;
    response.header.SetFlag(ilrd::wire::FLAG_RESPONSE);
    response.header.status_code = status;
    response.header.request_id = request_id;
    return response;
}

void TestMasterReadFailsOverToMirror()
{
    INIT_SUITE(suite, "Master Read Fails Over To Mirror");
    BEGIN_SUITE(suite);

    MockMinionProxy primary;
    MockMinionProxy mirror;
    MasterMetadata metadata;
    const UUID primary_id(20, 0, 0, 0);
    const UUID mirror_id(21, 0, 0, 0);
    metadata.RegisterNode(primary_id, primary, 4096);
    metadata.RegisterNode(mirror_id, mirror, 4096);
    metadata.SetNodeActive(primary_id, false);
    RAIDManager raid_manager(metadata, RAIDManager::Config{1024});
    ResponseManager response_manager;
    CompletionCollector collector;
    MasterRuntime runtime(raid_manager, response_manager, collector.Callback());
    BuildMasterCommandMap(runtime);

    const UUID request_id(22, 0, 0, 0);
    std::unique_ptr<ITask> task(
        new ReadTask(MakeReadRequest(request_id, 0, 4).header));

    MasterReadCommand command;
    command.Execute(SharedPtr<ITask>(task.release()));

    ASSERT_EQ(suite, 0u, primary.send_count);
    ASSERT_EQ(suite, 1u, mirror.send_count);
    ASSERT_EQ(suite, 2048ULL, mirror.last_offset);
    ASSERT_TRUE(suite, metadata.IsNodeOutOfSync(primary_id));

    const std::vector<std::uint8_t> payload = {1, 2, 3, 4};
    response_manager.HandleResponse(MakeReadResponse(request_id, 0, payload));
    ASSERT_TRUE(suite, collector.WaitForCount(1, std::chrono::milliseconds(100)));
    const ResponseManager::ResponseCompletion completion = collector.At(0);
    ASSERT_EQ(suite, static_cast<int>(StatusCode::DEGRADED_OK),
              static_cast<int>(completion.status));
    ASSERT_TRUE(suite, completion.response.header.HasFlag(ilrd::wire::FLAG_DEGRADED));
    ClearActiveMasterRuntime();

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestMasterWriteSkipsInactiveMirror()
{
    INIT_SUITE(suite, "Master Write Skips Inactive Mirror");
    BEGIN_SUITE(suite);

    MockMinionProxy primary;
    MockMinionProxy mirror;
    MasterMetadata metadata;
    const UUID primary_id(30, 0, 0, 0);
    const UUID mirror_id(31, 0, 0, 0);
    metadata.RegisterNode(primary_id, primary, 4096);
    metadata.RegisterNode(mirror_id, mirror, 4096);
    metadata.SetNodeActive(mirror_id, false);
    RAIDManager raid_manager(metadata, RAIDManager::Config{1024});
    ResponseManager response_manager;
    CompletionCollector collector;
    MasterRuntime runtime(raid_manager, response_manager, collector.Callback());
    BuildMasterCommandMap(runtime);

    const UUID request_id(32, 0, 0, 0);
    const std::vector<std::uint8_t> payload = {0xAA, 0xBB, 0xCC, 0xDD};
    std::unique_ptr<ITask> task(
        new WriteTask(MakeWriteRequest(request_id, 0, payload).header, payload));

    MasterWriteCommand command;
    command.Execute(SharedPtr<ITask>(task.release()));

    ASSERT_EQ(suite, 1u, primary.send_count);
    ASSERT_EQ(suite, 0u, mirror.send_count);
    ASSERT_TRUE(suite, metadata.IsNodeOutOfSync(mirror_id));

    response_manager.HandleResponse(
        MakeWriteResponse(request_id, 0, static_cast<std::uint32_t>(payload.size())));
    ASSERT_TRUE(suite, collector.WaitForCount(1, std::chrono::milliseconds(100)));
    const ResponseManager::ResponseCompletion completion = collector.At(0);
    ASSERT_EQ(suite, static_cast<int>(StatusCode::DEGRADED_OK),
              static_cast<int>(completion.status));
    ASSERT_TRUE(suite, completion.response.header.HasFlag(ilrd::wire::FLAG_DEGRADED));
    ClearActiveMasterRuntime();

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestMasterWriteUsesMirrorWhenPrimaryInactive()
{
    INIT_SUITE(suite, "Master Write Uses Mirror When Primary Inactive");
    BEGIN_SUITE(suite);

    MockMinionProxy primary;
    MockMinionProxy mirror;
    MasterMetadata metadata;
    const UUID primary_id(40, 0, 0, 0);
    const UUID mirror_id(41, 0, 0, 0);
    metadata.RegisterNode(primary_id, primary, 4096);
    metadata.RegisterNode(mirror_id, mirror, 4096);
    metadata.SetNodeActive(primary_id, false);
    RAIDManager raid_manager(metadata, RAIDManager::Config{1024});
    ResponseManager response_manager;
    CompletionCollector collector;
    MasterRuntime runtime(raid_manager, response_manager, collector.Callback());
    BuildMasterCommandMap(runtime);

    const UUID request_id(42, 0, 0, 0);
    const std::vector<std::uint8_t> payload = {0x01, 0x02};
    std::unique_ptr<ITask> task(
        new WriteTask(MakeWriteRequest(request_id, 0, payload).header, payload));

    MasterWriteCommand command;
    command.Execute(SharedPtr<ITask>(task.release()));

    ASSERT_EQ(suite, 0u, primary.send_count);
    ASSERT_EQ(suite, 1u, mirror.send_count);
    ASSERT_TRUE(suite, metadata.IsNodeOutOfSync(primary_id));

    response_manager.HandleResponse(
        MakeWriteResponse(request_id, 0, static_cast<std::uint32_t>(payload.size())));
    ASSERT_TRUE(suite, collector.WaitForCount(1, std::chrono::milliseconds(100)));
    const ResponseManager::ResponseCompletion completion = collector.At(0);
    ASSERT_EQ(suite, static_cast<int>(StatusCode::DEGRADED_OK),
              static_cast<int>(completion.status));
    ClearActiveMasterRuntime();

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestSingleNodeReadReturnsOk()
{
    INIT_SUITE(suite, "Single Node Read Returns OK");
    BEGIN_SUITE(suite);

    MockMinionProxy proxy;
    MasterMetadata metadata;
    metadata.RegisterNode(UUID(43, 0, 0, 0), proxy, 4096);
    RAIDManager raid_manager(metadata, RAIDManager::Config{1024});
    ResponseManager response_manager;
    CompletionCollector collector;
    MasterRuntime runtime(raid_manager, response_manager, collector.Callback());
    BuildMasterCommandMap(runtime);

    const UUID request_id(44, 0, 0, 0);
    std::unique_ptr<ITask> task(
        new ReadTask(MakeReadRequest(request_id, 0, 4).header));

    MasterReadCommand command;
    command.Execute(SharedPtr<ITask>(task.release()));

    ASSERT_EQ(suite, 1u, proxy.send_count);
    response_manager.HandleResponse(MakeReadResponse(request_id, 0, {9, 8, 7, 6}));
    ASSERT_TRUE(suite, collector.WaitForCount(1, std::chrono::milliseconds(100)));
    const ResponseManager::ResponseCompletion completion = collector.At(0);
    ASSERT_EQ(suite, static_cast<int>(StatusCode::OK),
              static_cast<int>(completion.status));
    ASSERT_FALSE(suite, completion.response.header.HasFlag(ilrd::wire::FLAG_DEGRADED));
    ClearActiveMasterRuntime();

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestSingleNodeWriteReturnsOk()
{
    INIT_SUITE(suite, "Single Node Write Returns OK");
    BEGIN_SUITE(suite);

    MockMinionProxy proxy;
    MasterMetadata metadata;
    metadata.RegisterNode(UUID(45, 0, 0, 0), proxy, 4096);
    RAIDManager raid_manager(metadata, RAIDManager::Config{1024});
    ResponseManager response_manager;
    CompletionCollector collector;
    MasterRuntime runtime(raid_manager, response_manager, collector.Callback());
    BuildMasterCommandMap(runtime);

    const UUID request_id(46, 0, 0, 0);
    const std::vector<std::uint8_t> payload = {1, 2, 3, 4};
    std::unique_ptr<ITask> task(
        new WriteTask(MakeWriteRequest(request_id, 0, payload).header, payload));

    MasterWriteCommand command;
    command.Execute(SharedPtr<ITask>(task.release()));

    ASSERT_EQ(suite, 1u, proxy.send_count);
    response_manager.HandleResponse(
        MakeWriteResponse(request_id, 0, static_cast<std::uint32_t>(payload.size())));
    ASSERT_TRUE(suite, collector.WaitForCount(1, std::chrono::milliseconds(100)));
    const ResponseManager::ResponseCompletion completion = collector.At(0);
    ASSERT_EQ(suite, static_cast<int>(StatusCode::OK),
              static_cast<int>(completion.status));
    ASSERT_FALSE(suite, completion.response.header.HasFlag(ilrd::wire::FLAG_DEGRADED));
    ClearActiveMasterRuntime();

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestSingleNodeFlushReturnsOk()
{
    INIT_SUITE(suite, "Single Node Flush Returns OK");
    BEGIN_SUITE(suite);

    MockMinionProxy proxy;
    MasterMetadata metadata;
    metadata.RegisterNode(UUID(47, 0, 0, 0), proxy, 4096);
    RAIDManager raid_manager(metadata, RAIDManager::Config{1024});
    ResponseManager response_manager;
    CompletionCollector collector;
    MasterRuntime runtime(raid_manager, response_manager, collector.Callback());
    BuildMasterCommandMap(runtime);

    const UUID request_id(48, 0, 0, 0);
    std::unique_ptr<ITask> task(
        new FlushTask(MakeFlushRequest(request_id).header));

    MasterFlushCommand command;
    command.Execute(SharedPtr<ITask>(task.release()));

    ASSERT_EQ(suite, 1u, proxy.send_count);
    response_manager.HandleResponse(MakeFlushResponse(request_id));
    ASSERT_TRUE(suite, collector.WaitForCount(1, std::chrono::milliseconds(100)));
    const ResponseManager::ResponseCompletion completion = collector.At(0);
    ASSERT_EQ(suite, static_cast<int>(StatusCode::OK),
              static_cast<int>(completion.status));
    ASSERT_FALSE(suite, completion.response.header.HasFlag(ilrd::wire::FLAG_DEGRADED));
    ClearActiveMasterRuntime();

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestMasterReadAggregatesAcrossStripes()
{
    INIT_SUITE(suite, "Master Read Aggregates Across Stripes");
    BEGIN_SUITE(suite);

    MockMinionProxy first;
    MockMinionProxy second;
    MasterMetadata metadata;
    metadata.RegisterNode(UUID(50, 0, 0, 0), first, 4096);
    metadata.RegisterNode(UUID(51, 0, 0, 0), second, 4096);
    RAIDManager raid_manager(metadata, RAIDManager::Config{4});
    ResponseManager response_manager;
    CompletionCollector collector;
    MasterRuntime runtime(raid_manager, response_manager, collector.Callback());
    BuildMasterCommandMap(runtime);

    const UUID request_id(52, 0, 0, 0);
    std::unique_ptr<ITask> task(
        new ReadTask(MakeReadRequest(request_id, 2, 6).header));

    MasterReadCommand command;
    command.Execute(SharedPtr<ITask>(task.release()));

    ASSERT_EQ(suite, 1u, first.send_count);
    ASSERT_EQ(suite, 1u, second.send_count);
    ASSERT_EQ(suite, 2u, response_manager.PendingCount());
    ASSERT_EQ(suite, 2ULL, first.sent_offsets[0]);
    ASSERT_EQ(suite, 0ULL, second.sent_offsets[0]);

    response_manager.HandleResponse(
        MakeReadResponse(first.sent_request_ids[0], 2, {1, 2}));
    response_manager.HandleResponse(
        MakeReadResponse(second.sent_request_ids[0], 0, {3, 4, 5, 6}));

    ASSERT_TRUE(suite, collector.WaitForCount(1, std::chrono::milliseconds(100)));
    const ResponseManager::ResponseCompletion completion = collector.At(0);
    ASSERT_TRUE(suite, completion.request_id == request_id);
    ASSERT_EQ(suite, 6u, completion.payload.size());
    ASSERT_EQ(suite, 1, completion.payload[0]);
    ASSERT_EQ(suite, 6, completion.payload[5]);
    ClearActiveMasterRuntime();

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestMasterWriteMirrorsAcrossSegments()
{
    INIT_SUITE(suite, "Master Write Mirrors Across Segments");
    BEGIN_SUITE(suite);

    MockMinionProxy first;
    MockMinionProxy second;
    MasterMetadata metadata;
    metadata.RegisterNode(UUID(60, 0, 0, 0), first, 4096);
    metadata.RegisterNode(UUID(61, 0, 0, 0), second, 4096);
    RAIDManager raid_manager(metadata, RAIDManager::Config{4});
    ResponseManager response_manager;
    CompletionCollector collector;
    MasterRuntime runtime(raid_manager, response_manager, collector.Callback());
    BuildMasterCommandMap(runtime);

    const UUID request_id(62, 0, 0, 0);
    const std::vector<std::uint8_t> payload = {10, 11, 12, 13, 14, 15};
    std::unique_ptr<ITask> task(
        new WriteTask(MakeWriteRequest(request_id, 2, payload).header, payload));

    MasterWriteCommand command;
    command.Execute(SharedPtr<ITask>(task.release()));

    ASSERT_EQ(suite, 2u, first.send_count);
    ASSERT_EQ(suite, 2u, second.send_count);
    ASSERT_EQ(suite, 4u, response_manager.PendingCount());
    ASSERT_EQ(suite, 2ULL, first.sent_offsets[0]);
    ASSERT_EQ(suite, 2048ULL, first.sent_offsets[1]);
    ASSERT_EQ(suite, 2050ULL, second.sent_offsets[0]);
    ASSERT_EQ(suite, 0ULL, second.sent_offsets[1]);
    ASSERT_EQ(suite, 2u, first.sent_payloads[0].size());
    ASSERT_EQ(suite, 4u, first.sent_payloads[1].size());

    for (const UUID& child_id : first.sent_request_ids)
    {
        response_manager.HandleResponse(
            MakeWriteResponse(child_id, 0, 0));
    }
    for (const UUID& child_id : second.sent_request_ids)
    {
        response_manager.HandleResponse(
            MakeWriteResponse(child_id, 0, 0));
    }

    ASSERT_TRUE(suite, collector.WaitForCount(1, std::chrono::milliseconds(100)));
    const ResponseManager::ResponseCompletion completion = collector.At(0);
    ASSERT_TRUE(suite, completion.request_id == request_id);
    ASSERT_EQ(suite, static_cast<int>(StatusCode::OK),
              static_cast<int>(completion.status));
    ClearActiveMasterRuntime();

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestMasterFlushTargetsAllActiveNodes()
{
    INIT_SUITE(suite, "Master Flush Targets All Active Nodes");
    BEGIN_SUITE(suite);

    MockMinionProxy first;
    MockMinionProxy second;
    MockMinionProxy third;
    MasterMetadata metadata;
    const UUID first_id(70, 0, 0, 0);
    const UUID second_id(71, 0, 0, 0);
    const UUID third_id(72, 0, 0, 0);
    metadata.RegisterNode(first_id, first, 4096);
    metadata.RegisterNode(second_id, second, 4096);
    metadata.RegisterNode(third_id, third, 4096);
    metadata.SetNodeActive(third_id, false);
    RAIDManager raid_manager(metadata, RAIDManager::Config{4});
    ResponseManager response_manager;
    CompletionCollector collector;
    MasterRuntime runtime(raid_manager, response_manager, collector.Callback());
    BuildMasterCommandMap(runtime);

    const UUID request_id(73, 0, 0, 0);
    std::unique_ptr<ITask> task(
        new FlushTask(MakeFlushRequest(request_id).header));

    MasterFlushCommand command;
    command.Execute(SharedPtr<ITask>(task.release()));

    ASSERT_EQ(suite, 1u, first.send_count);
    ASSERT_EQ(suite, 1u, second.send_count);
    ASSERT_EQ(suite, 0u, third.send_count);
    ASSERT_EQ(suite, 2u, response_manager.PendingCount());

    response_manager.HandleResponse(
        MakeFlushResponse(first.sent_request_ids[0]));
    response_manager.HandleResponse(
        MakeFlushResponse(second.sent_request_ids[0]));

    ASSERT_TRUE(suite, collector.WaitForCount(1, std::chrono::milliseconds(100)));
    const ResponseManager::ResponseCompletion completion = collector.At(0);
    ASSERT_EQ(suite, static_cast<int>(StatusCode::DEGRADED_OK),
              static_cast<int>(completion.status));
    ClearActiveMasterRuntime();

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestMasterWriteCommandReturnsRetryParamsAndRetransmits()
{
    INIT_SUITE(suite, "Master Write Command Retransmits Pending Child");
    BEGIN_SUITE(suite);

    MockMinionProxy proxy;
    RAIDManager raid_manager(proxy);
    ResponseManager response_manager;
    CompletionCollector collector;
    MasterRuntime runtime(raid_manager, response_manager, collector.Callback());
    BuildMasterCommandMap(runtime);

    const UUID request_id(80, 0, 0, 0);
    const std::vector<std::uint8_t> payload = {0x01, 0x02, 0x03, 0x04};
    std::unique_ptr<ITask> task(
        new WriteTask(MakeWriteRequest(request_id, 0, payload).header, payload));

    MasterWriteCommand command;
    std::unique_ptr<ilrd::ICommand::PostTaskParams> retry_params =
        command.Execute(SharedPtr<ITask>(task.release()));

    ASSERT_NOT_NULL(suite, retry_params.get());
    ASSERT_EQ(suite, 100LL, retry_params->time_interval.count());
    ASSERT_EQ(suite, 1u, proxy.send_count);
    ASSERT_FALSE(suite, retry_params->action());
    ASSERT_EQ(suite, 2u, proxy.send_count);
    ASSERT_TRUE(suite, proxy.sent_request_ids[0] == proxy.sent_request_ids[1]);

    response_manager.HandleResponse(
        MakeWriteResponse(request_id, 0, static_cast<std::uint32_t>(payload.size())));
    ASSERT_TRUE(suite, collector.WaitForCount(1, std::chrono::milliseconds(100)));
    ASSERT_TRUE(suite, retry_params->action());
    ASSERT_EQ(suite, 2u, proxy.send_count);
    ClearActiveMasterRuntime();

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestMasterRetryStopsAfterLimit()
{
    INIT_SUITE(suite, "Master Retry Stops After Limit");
    BEGIN_SUITE(suite);

    MockMinionProxy proxy;
    RAIDManager raid_manager(proxy);
    ResponseManager response_manager;
    CompletionCollector collector;
    MasterRuntime::RetryConfig retry_config;
    retry_config.max_retries = 2;
    retry_config.interval = std::chrono::milliseconds(7);
    MasterRuntime runtime(raid_manager, response_manager, collector.Callback(),
                          retry_config);
    BuildMasterCommandMap(runtime);

    const UUID request_id(81, 0, 0, 0);
    const std::vector<std::uint8_t> payload = {0xAA};
    std::unique_ptr<ITask> task(
        new WriteTask(MakeWriteRequest(request_id, 0, payload).header, payload));

    MasterWriteCommand command;
    std::unique_ptr<ilrd::ICommand::PostTaskParams> retry_params =
        command.Execute(SharedPtr<ITask>(task.release()));

    ASSERT_NOT_NULL(suite, retry_params.get());
    ASSERT_EQ(suite, 7LL, retry_params->time_interval.count());
    ASSERT_FALSE(suite, retry_params->action());
    ASSERT_FALSE(suite, retry_params->action());
    ASSERT_TRUE(suite, retry_params->action());
    ASSERT_EQ(suite, 3u, proxy.send_count);
    ASSERT_EQ(suite, 0u, response_manager.PendingCount());
    ASSERT_TRUE(suite, collector.WaitForCount(1, std::chrono::milliseconds(100)));
    const ResponseManager::ResponseCompletion completion = collector.At(0);
    ASSERT_TRUE(suite, completion.request_id == request_id);
    ASSERT_EQ(suite, static_cast<int>(ResponseManager::State::FAILED),
              static_cast<int>(completion.state));
    ASSERT_EQ(suite, static_cast<int>(StatusCode::UNAVAILABLE),
              static_cast<int>(completion.status));
    ClearActiveMasterRuntime();

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestMasterRetryOnlyRetransmitsPendingChildren()
{
    INIT_SUITE(suite, "Master Retry Only Retransmits Pending Children");
    BEGIN_SUITE(suite);

    MockMinionProxy first;
    MockMinionProxy second;
    MasterMetadata metadata;
    metadata.RegisterNode(UUID(82, 0, 0, 0), first, 4096);
    metadata.RegisterNode(UUID(83, 0, 0, 0), second, 4096);
    RAIDManager raid_manager(metadata, RAIDManager::Config{4});
    ResponseManager response_manager;
    CompletionCollector collector;
    MasterRuntime runtime(raid_manager, response_manager, collector.Callback());
    BuildMasterCommandMap(runtime);

    const UUID request_id(84, 0, 0, 0);
    std::unique_ptr<ITask> task(
        new ReadTask(MakeReadRequest(request_id, 2, 6).header));

    MasterReadCommand command;
    std::unique_ptr<ilrd::ICommand::PostTaskParams> retry_params =
        command.Execute(SharedPtr<ITask>(task.release()));

    ASSERT_NOT_NULL(suite, retry_params.get());
    ASSERT_EQ(suite, 1u, first.send_count);
    ASSERT_EQ(suite, 1u, second.send_count);

    response_manager.HandleResponse(
        MakeReadResponse(first.sent_request_ids[0], 2, {1, 2}));

    ASSERT_FALSE(suite, retry_params->action());
    ASSERT_EQ(suite, 1u, first.send_count);
    ASSERT_EQ(suite, 2u, second.send_count);
    ASSERT_TRUE(suite, second.sent_request_ids[0] == second.sent_request_ids[1]);

    response_manager.HandleResponse(
        MakeReadResponse(second.sent_request_ids[0], 0, {3, 4, 5, 6}));
    ASSERT_TRUE(suite, collector.WaitForCount(1, std::chrono::milliseconds(100)));
    const ResponseManager::ResponseCompletion completion = collector.At(0);
    ASSERT_TRUE(suite, completion.request_id == request_id);
    ASSERT_EQ(suite, static_cast<int>(StatusCode::OK),
              static_cast<int>(completion.status));
    ClearActiveMasterRuntime();

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestFrameworkMasterToMinionSlice()
{
    INIT_SUITE(suite, "Framework Master To Minion Slice");
    BEGIN_SUITE(suite);

    const std::uint16_t minion_port = ReserveUdpPort();
    TempBackingFile temp("master_commands_integration");
    UdpSocket master_minion_socket;
    UdpSocket synthetic_sender;
    UdpSocket synthetic_input;
    master_minion_socket.BindLoopback();
    synthetic_sender.BindLoopback();
    synthetic_input.BindLoopback();

    const std::string binary_path = MinionBinaryPath();
    pid_t child = fork();
    if (child < 0)
    {
        throw std::runtime_error("fork failed");
    }

    if (0 == child)
    {
        const std::string port = std::to_string(minion_port);
        execl(binary_path.c_str(), binary_path.c_str(),
              "--bind-ip", "127.0.0.1",
              "--port", port.c_str(),
              "--storage-path", temp.PathName().c_str(),
              "--capacity-bytes", "4096",
              static_cast<char*>(nullptr));
        _exit(127);
    }

    int status = 0;
    try
    {
        std::this_thread::sleep_for(std::chrono::milliseconds(250));

        ResponseManager response_manager;
        CompletionCollector collector;
        MinionProxy minion_proxy(master_minion_socket.Fd(), "127.0.0.1",
                                 minion_port);
        MasterMetadata metadata;
        metadata.RegisterNode(UUID(100, 200, 300, 400), minion_proxy, 4096);
        RAIDManager raid_manager(metadata);
        MasterRuntime runtime(raid_manager, response_manager,
                              collector.Callback());

        std::shared_ptr<IInputProxy> synthetic_proxy(new SyntheticMasterInputProxy());
        std::shared_ptr<IInputProxy> response_proxy(
            new MinionResponseProxy(master_minion_socket.Fd(), "127.0.0.1",
                                    minion_port, response_manager));

        Framework::ProxyMap proxy_map;
        proxy_map[ilrd::IListener::ModeAndFd(ilrd::IListener::READ,
                                             synthetic_input.Fd())] =
            synthetic_proxy;
        proxy_map[ilrd::IListener::ModeAndFd(ilrd::IListener::READ,
                                             master_minion_socket.Fd())] =
            response_proxy;

        Framework framework(proxy_map, BuildMasterCommandMap(runtime), "");
        std::thread runner([&framework]() { framework.Run(); });

        const std::vector<std::uint8_t> payload = {0xCA, 0xFE, 0xBA, 0xBE};
        const UUID write_id(10, 20, 30, 40);
        SendMessage(synthetic_sender.Fd(), synthetic_input.Address(),
                    MakeWriteRequest(write_id, 128, payload));
        ASSERT_TRUE(suite,
                    collector.WaitForCount(1, std::chrono::milliseconds(2000)));
        ResponseManager::ResponseCompletion write_completion = collector.At(0);
        ASSERT_TRUE(suite, write_completion.request_id == write_id);
        ASSERT_EQ(suite, static_cast<int>(MessageType::WRITE_RESP),
                  static_cast<int>(write_completion.response_type));
        ASSERT_EQ(suite, static_cast<int>(StatusCode::OK),
                  static_cast<int>(write_completion.status));

        const UUID read_id(11, 21, 31, 41);
        SendMessage(synthetic_sender.Fd(), synthetic_input.Address(),
                    MakeReadRequest(read_id, 128,
                                    static_cast<std::uint32_t>(payload.size())));
        ASSERT_TRUE(suite,
                    collector.WaitForCount(2, std::chrono::milliseconds(2000)));
        ResponseManager::ResponseCompletion read_completion = collector.At(1);
        ASSERT_TRUE(suite, read_completion.request_id == read_id);
        ASSERT_EQ(suite, static_cast<int>(MessageType::READ_RESP),
                  static_cast<int>(read_completion.response_type));
        ASSERT_EQ(suite, payload.size(), read_completion.payload.size());
        ASSERT_EQ(suite, 0xCA, read_completion.payload[0]);
        ASSERT_EQ(suite, 0xBE, read_completion.payload[3]);

        const UUID flush_id(12, 22, 32, 42);
        SendMessage(synthetic_sender.Fd(), synthetic_input.Address(),
                    MakeFlushRequest(flush_id));
        ASSERT_TRUE(suite,
                    collector.WaitForCount(3, std::chrono::milliseconds(2000)));
        ResponseManager::ResponseCompletion flush_completion = collector.At(2);
        ASSERT_TRUE(suite, flush_completion.request_id == flush_id);
        ASSERT_EQ(suite, static_cast<int>(MessageType::FLUSH_RESP),
                  static_cast<int>(flush_completion.response_type));

        framework.Stop();
        runner.join();
        ClearActiveMasterRuntime();
    }
    catch (...)
    {
        ilrd::RequestFrameworkStop();
        ClearActiveMasterRuntime();
        kill(child, SIGTERM);
        waitpid(child, &status, 0);
        throw;
    }

    kill(child, SIGTERM);
    waitpid(child, &status, 0);
    ASSERT_TRUE(suite, WIFEXITED(status) || WIFSIGNALED(status));
    if (WIFEXITED(status))
    {
        ASSERT_EQ(suite, 0, WEXITSTATUS(status));
    }

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

} // namespace

int main()
{
    PRINT_TEST_HEADER("MasterCommands");

    TestBuildMasterCommandMap();
    TestMasterWriteCommandSends();
    TestWrongTaskTypeDoesNotSend();
    TestSendFailureCompletes();
    TestMasterReadFailsOverToMirror();
    TestMasterWriteSkipsInactiveMirror();
    TestMasterWriteUsesMirrorWhenPrimaryInactive();
    TestSingleNodeReadReturnsOk();
    TestSingleNodeWriteReturnsOk();
    TestSingleNodeFlushReturnsOk();
    TestMasterReadAggregatesAcrossStripes();
    TestMasterWriteMirrorsAcrossSegments();
    TestMasterFlushTargetsAllActiveNodes();
    TestMasterWriteCommandReturnsRetryParamsAndRetransmits();
    TestMasterRetryStopsAfterLimit();
    TestMasterRetryOnlyRetransmitsPendingChildren();
    TestFrameworkMasterToMinionSlice();

    PRINT_SUMMARY();
    return 0;
}
