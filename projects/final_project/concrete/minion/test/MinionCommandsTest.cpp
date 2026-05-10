#include <cstdint>
#include <filesystem>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <vector>

#include <sys/socket.h>
#include <unistd.h>

#include "tasks/ConcreteTasks.hpp"
#include "Logger.hpp"
#include "transport/MasterProxy.hpp"
#include "commands/MinionCommands.hpp"
#include "runtime/MinionRuntime.hpp"
#include "storage/MinionStorageBackend.hpp"
#include "SharedPtr.hpp"
#include "wire/WireProtocol.hpp"
#include "test_utils.hpp"

namespace
{

using ilrd::Buffer;
using ilrd::ICommand;
using ilrd::ITask;
using ilrd::Logger;
using ilrd::SharedPtr;
using ilrd::UUID;
using ilrd::concrete::BuildMinionCommandMap;
using ilrd::concrete::FlushTask;
using ilrd::concrete::HEARTBEAT_COMMAND_KEY;
using ilrd::concrete::HeartbeatTask;
using ilrd::concrete::MasterProxy;
using ilrd::concrete::MinionRuntime;
using ilrd::concrete::MinionStorageBackend;
using ilrd::concrete::ReadTask;
using ilrd::concrete::WriteTask;
using ilrd::wire::FLAG_HAS_PAYLOAD;
using ilrd::wire::HealthState;
using ilrd::wire::HeartbeatAckBodyV1;
using ilrd::wire::HeartbeatBodyV1;
using ilrd::wire::MessageType;
using ilrd::wire::MessageV1;
using ilrd::wire::StatusCode;

class VectorSink : public Logger::Sink
{
  public:
    void Write(const std::string& formatted_line) override
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_lines.push_back(formatted_line);
    }

    void Flush() override
    {
    }

  private:
    std::mutex m_mutex;
    std::vector<std::string> m_lines;
};

class DatagramPair
{
  public:
    DatagramPair() : m_fds{-1, -1}
    {
        if (0 != socketpair(AF_UNIX, SOCK_DGRAM, 0, m_fds))
        {
            throw std::runtime_error("socketpair failed");
        }
    }

    ~DatagramPair()
    {
        if (-1 != m_fds[0])
        {
            close(m_fds[0]);
        }

        if (-1 != m_fds[1])
        {
            close(m_fds[1]);
        }
    }

    int FirstFd() const
    {
        return m_fds[0];
    }

    int SecondFd() const
    {
        return m_fds[1];
    }

    void SendToFirst(const MessageV1& message) const
    {
        Buffer buffer;
        message.Serialize(buffer);

        const ssize_t bytes_sent =
            send(m_fds[1], buffer.GetData(), buffer.GetSize(), 0);
        if (bytes_sent != static_cast<ssize_t>(buffer.GetSize()))
        {
            throw std::runtime_error("send to first failed");
        }
    }

    MessageV1 ReceiveOnSecond() const
    {
        std::vector<std::uint8_t> bytes(4096, 0);
        const ssize_t bytes_read = recv(m_fds[1], bytes.data(), bytes.size(), 0);
        if (bytes_read <= 0)
        {
            throw std::runtime_error("recv on second failed");
        }

        bytes.resize(static_cast<std::size_t>(bytes_read));
        Buffer buffer = ilrd::wire::MakeBuffer(bytes);
        MessageV1 message;
        message.Deserialize(buffer);
        return message;
    }

  private:
    mutable int m_fds[2];
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

std::shared_ptr<VectorSink> InstallVectorSink()
{
    std::shared_ptr<VectorSink> sink(new VectorSink());
    Logger::Instance().SetSink(sink);
    return sink;
}

MessageV1 MakeReadRequest(const UUID& request_id, std::uint64_t offset,
                          std::uint32_t length)
{
    MessageV1 message;
    message.header.message_type = MessageType::READ_REQ;
    message.header.request_id = request_id;
    message.header.logical_offset = offset;
    message.header.operation_length = length;
    return message;
}

MessageV1 MakeWriteRequest(const UUID& request_id, std::uint64_t offset,
                           const std::vector<std::uint8_t>& payload)
{
    MessageV1 message;
    message.header.message_type = MessageType::WRITE_REQ;
    message.header.request_id = request_id;
    message.header.logical_offset = offset;
    message.header.operation_length = payload.size();
    message.header.payload_length = payload.size();
    message.header.SetFlag(FLAG_HAS_PAYLOAD);
    message.payload = payload;
    return message;
}

MessageV1 MakeFlushRequest(const UUID& request_id)
{
    MessageV1 message;
    message.header.message_type = MessageType::FLUSH_REQ;
    message.header.request_id = request_id;
    return message;
}

MessageV1 MakeHeartbeatRequest(const UUID& request_id,
                               const HeartbeatBodyV1& body)
{
    Buffer payload_buffer;
    body.Serialize(payload_buffer);

    MessageV1 message;
    message.header.message_type = MessageType::HEARTBEAT_REQ;
    message.header.request_id = request_id;
    message.header.payload_length = payload_buffer.GetSize();
    message.header.SetFlag(FLAG_HAS_PAYLOAD);
    message.payload.assign(payload_buffer.GetData(),
                           payload_buffer.GetData() + payload_buffer.GetSize());
    return message;
}

MessageV1 ExecuteTaskAndReceive(const ilrd::Framework::CommandMap& command_map,
                                ITask* task,
                                const DatagramPair& pair)
{
    std::unique_ptr<ICommand> command(command_map.at(task->GetKey())());
    command->Execute(SharedPtr<ITask>(task));
    return pair.ReceiveOnSecond();
}

void TestBuildMinionCommandMap()
{
    INIT_SUITE(suite, "Build Minion Command Map");
    BEGIN_SUITE(suite);

    InstallVectorSink();
    TempBackingFile temp("minion_commands_map");
    DatagramPair pair;
    MasterProxy proxy(pair.FirstFd());
    MinionStorageBackend storage(temp.PathName(), 1024);
    MinionRuntime runtime(storage, proxy);

    const ilrd::Framework::CommandMap command_map = BuildMinionCommandMap(runtime);

    ASSERT_EQ(suite, 4u, command_map.size());
    ASSERT_TRUE(suite, command_map.end() != command_map.find(ilrd::concrete::READ_COMMAND_KEY));
    ASSERT_TRUE(suite, command_map.end() != command_map.find(ilrd::concrete::WRITE_COMMAND_KEY));
    ASSERT_TRUE(suite, command_map.end() != command_map.find(ilrd::concrete::FLUSH_COMMAND_KEY));
    ASSERT_TRUE(suite, command_map.end() != command_map.find(HEARTBEAT_COMMAND_KEY));

    ilrd::concrete::ClearActiveMinionRuntime();
    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestWriteCommandSuccess()
{
    INIT_SUITE(suite, "Write Command Success");
    BEGIN_SUITE(suite);

    InstallVectorSink();
    TempBackingFile temp("minion_commands_write");
    DatagramPair pair;
    MasterProxy proxy(pair.FirstFd());
    MinionStorageBackend storage(temp.PathName(), 1024);
    MinionRuntime runtime(storage, proxy);
    const ilrd::Framework::CommandMap command_map = BuildMinionCommandMap(runtime);
    const std::vector<std::uint8_t> payload = {0x01, 0x02, 0x03, 0x04};

    pair.SendToFirst(MakeWriteRequest(UUID(1, 2, 3, 4), 128, payload));
    MessageV1 response =
        ExecuteTaskAndReceive(command_map, proxy.GetTask(pair.FirstFd()), pair);

    ASSERT_EQ(suite, static_cast<int>(MessageType::WRITE_RESP),
              static_cast<int>(response.header.message_type));
    ASSERT_EQ(suite, static_cast<int>(StatusCode::OK),
              static_cast<int>(response.header.status_code));

    const std::vector<std::uint8_t> stored = storage.Read(128, payload.size());
    ASSERT_EQ(suite, payload.size(), stored.size());
    ASSERT_EQ(suite, 0x01, stored[0]);
    ASSERT_EQ(suite, 0x04, stored[3]);

    ilrd::concrete::ClearActiveMinionRuntime();
    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestReadCommandSuccess()
{
    INIT_SUITE(suite, "Read Command Success");
    BEGIN_SUITE(suite);

    InstallVectorSink();
    TempBackingFile temp("minion_commands_read");
    DatagramPair pair;
    MasterProxy proxy(pair.FirstFd());
    MinionStorageBackend storage(temp.PathName(), 1024);
    MinionRuntime runtime(storage, proxy);
    const ilrd::Framework::CommandMap command_map = BuildMinionCommandMap(runtime);
    const std::vector<std::uint8_t> payload = {0xA1, 0xB2, 0xC3, 0xD4};

    storage.Write(64, payload);

    pair.SendToFirst(MakeReadRequest(UUID(5, 6, 7, 8), 64, payload.size()));
    MessageV1 response =
        ExecuteTaskAndReceive(command_map, proxy.GetTask(pair.FirstFd()), pair);

    ASSERT_EQ(suite, static_cast<int>(MessageType::READ_RESP),
              static_cast<int>(response.header.message_type));
    ASSERT_EQ(suite, static_cast<int>(StatusCode::OK),
              static_cast<int>(response.header.status_code));
    ASSERT_EQ(suite, payload.size(), response.payload.size());
    ASSERT_EQ(suite, 0xA1, response.payload[0]);
    ASSERT_EQ(suite, 0xD4, response.payload[3]);

    ilrd::concrete::ClearActiveMinionRuntime();
    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestFlushCommandSuccess()
{
    INIT_SUITE(suite, "Flush Command Success");
    BEGIN_SUITE(suite);

    InstallVectorSink();
    TempBackingFile temp("minion_commands_flush");
    DatagramPair pair;
    MasterProxy proxy(pair.FirstFd());
    MinionStorageBackend storage(temp.PathName(), 1024);
    MinionRuntime runtime(storage, proxy);
    const ilrd::Framework::CommandMap command_map = BuildMinionCommandMap(runtime);

    pair.SendToFirst(MakeFlushRequest(UUID(9, 10, 11, 12)));
    MessageV1 response =
        ExecuteTaskAndReceive(command_map, proxy.GetTask(pair.FirstFd()), pair);

    ASSERT_EQ(suite, static_cast<int>(MessageType::FLUSH_RESP),
              static_cast<int>(response.header.message_type));
    ASSERT_EQ(suite, static_cast<int>(StatusCode::OK),
              static_cast<int>(response.header.status_code));
    ASSERT_EQ(suite, 0u, response.payload.size());

    ilrd::concrete::ClearActiveMinionRuntime();
    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestWriteCommandOutOfRange()
{
    INIT_SUITE(suite, "Write Command Out Of Range");
    BEGIN_SUITE(suite);

    InstallVectorSink();
    TempBackingFile temp("minion_commands_oob");
    DatagramPair pair;
    MasterProxy proxy(pair.FirstFd());
    MinionStorageBackend storage(temp.PathName(), 64);
    MinionRuntime runtime(storage, proxy);
    const ilrd::Framework::CommandMap command_map = BuildMinionCommandMap(runtime);
    const std::vector<std::uint8_t> payload(32, 0xEF);

    pair.SendToFirst(MakeWriteRequest(UUID(13, 14, 15, 16), 48, payload));
    MessageV1 response =
        ExecuteTaskAndReceive(command_map, proxy.GetTask(pair.FirstFd()), pair);

    ASSERT_EQ(suite, static_cast<int>(MessageType::WRITE_RESP),
              static_cast<int>(response.header.message_type));
    ASSERT_EQ(suite, static_cast<int>(StatusCode::OUT_OF_RANGE),
              static_cast<int>(response.header.status_code));

    ilrd::concrete::ClearActiveMinionRuntime();
    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestWriteCommandRejectsPayloadLengthMismatch()
{
    INIT_SUITE(suite, "Write Command Rejects Payload Length Mismatch");
    BEGIN_SUITE(suite);

    InstallVectorSink();
    TempBackingFile temp("minion_commands_bad_length");
    DatagramPair pair;
    MasterProxy proxy(pair.FirstFd());
    MinionStorageBackend storage(temp.PathName(), 1024);
    MinionRuntime runtime(storage, proxy);
    const ilrd::Framework::CommandMap command_map = BuildMinionCommandMap(runtime);

    pair.SendToFirst(MakeFlushRequest(UUID(17, 18, 19, 20)));
    std::unique_ptr<ITask> cached_task(proxy.GetTask(pair.FirstFd()));
    ASSERT_NOT_NULL(suite, cached_task.get());

    ilrd::wire::MessageHeaderV1 header;
    header.message_type = MessageType::WRITE_REQ;
    header.request_id = UUID(21, 22, 23, 24);
    header.logical_offset = 32;
    header.operation_length = 8;
    header.payload_length = 4;
    header.SetFlag(FLAG_HAS_PAYLOAD);

    MessageV1 response = ExecuteTaskAndReceive(
        command_map,
        new WriteTask(header, std::vector<std::uint8_t>(4, 0xAB)),
        pair);

    ASSERT_EQ(suite, static_cast<int>(MessageType::WRITE_RESP),
              static_cast<int>(response.header.message_type));
    ASSERT_EQ(suite, static_cast<int>(StatusCode::BAD_LENGTH),
              static_cast<int>(response.header.status_code));

    ilrd::concrete::ClearActiveMinionRuntime();
    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestHeartbeatCommandSuccess()
{
    INIT_SUITE(suite, "Heartbeat Command Success");
    BEGIN_SUITE(suite);

    InstallVectorSink();
    TempBackingFile temp("minion_commands_heartbeat");
    DatagramPair pair;
    MasterProxy proxy(pair.FirstFd());
    MinionStorageBackend storage(temp.PathName(), 1024);
    const UUID node_id(100, 200, 300, 400);
    MinionRuntime runtime(storage, proxy, node_id, HealthState::HEALTHY);
    const ilrd::Framework::CommandMap command_map = BuildMinionCommandMap(runtime);

    HeartbeatBodyV1 request_body;
    request_body.node_id = UUID(8, 9, 10, 11);
    request_body.heartbeat_seq = 4242;
    request_body.health_state = HealthState::DEGRADED;
    const UUID request_id(25, 26, 27, 28);

    pair.SendToFirst(MakeHeartbeatRequest(request_id, request_body));
    std::unique_ptr<ITask> task(proxy.GetTask(pair.FirstFd()));
    HeartbeatTask* heartbeat_task = dynamic_cast<HeartbeatTask*>(task.get());
    ASSERT_NOT_NULL(suite, heartbeat_task);

    MessageV1 response =
        ExecuteTaskAndReceive(command_map, task.release(), pair);

    ASSERT_EQ(suite, static_cast<int>(MessageType::HEARTBEAT_RESP),
              static_cast<int>(response.header.message_type));
    ASSERT_EQ(suite, static_cast<int>(StatusCode::OK),
              static_cast<int>(response.header.status_code));
    ASSERT_TRUE(suite, response.header.HasFlag(FLAG_HAS_PAYLOAD));

    Buffer ack_buffer = ilrd::wire::MakeBuffer(response.payload);
    HeartbeatAckBodyV1 ack_body;
    ack_body.Deserialize(ack_buffer);

    ASSERT_TRUE(suite, ack_body.node_id == node_id);
    ASSERT_EQ(suite, 4242ULL, ack_body.acked_seq);
    ASSERT_EQ(suite, static_cast<int>(HealthState::HEALTHY),
              static_cast<int>(ack_body.accepted_state));
    ASSERT_TRUE(suite, response.header.request_id == request_id);

    ilrd::concrete::ClearActiveMinionRuntime();
    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

} // namespace

int main()
{
    PRINT_TEST_HEADER("Minion Commands");

    TestBuildMinionCommandMap();
    TestWriteCommandSuccess();
    TestReadCommandSuccess();
    TestFlushCommandSuccess();
    TestWriteCommandOutOfRange();
    TestWriteCommandRejectsPayloadLengthMismatch();
    TestHeartbeatCommandSuccess();

    PRINT_SUMMARY();
    return 0;
}
