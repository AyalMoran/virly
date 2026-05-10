#include <arpa/inet.h>
#include <chrono>
#include <csignal>
#include <cstdlib>
#include <filesystem>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

#include <sys/socket.h>
#include <sys/wait.h>
#include <unistd.h>

#include "identity/UUID.hpp"
#include "wire/WireProtocol.hpp"
#include "test_utils.hpp"

namespace
{

using ilrd::Buffer;
using ilrd::UUID;
using ilrd::wire::FLAG_HAS_PAYLOAD;
using ilrd::wire::HealthState;
using ilrd::wire::HeartbeatAckBodyV1;
using ilrd::wire::HeartbeatBodyV1;
using ilrd::wire::MessageType;
using ilrd::wire::MessageV1;
using ilrd::wire::StatusCode;

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

  private:
    int m_fd;
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

MessageV1 ReceiveMessage(int fd)
{
    std::vector<std::uint8_t> bytes(4096, 0);
    const ssize_t bytes_read = recv(fd, bytes.data(), bytes.size(), 0);
    if (bytes_read <= 0)
    {
        throw std::runtime_error("recv failed");
    }

    bytes.resize(static_cast<std::size_t>(bytes_read));
    Buffer buffer = ilrd::wire::MakeBuffer(bytes);
    MessageV1 message;
    message.Deserialize(buffer);
    return message;
}

void TestMinionHeartbeatSmoke()
{
    INIT_SUITE(suite, "Minion Heartbeat Smoke");
    BEGIN_SUITE(suite);

    TempBackingFile temp("minion_smoke");
    UdpSocket client_socket;

    timeval timeout = {};
    timeout.tv_sec = 2;
    timeout.tv_usec = 0;
    if (0 != setsockopt(client_socket.Fd(), SOL_SOCKET, SO_RCVTIMEO, &timeout,
                        sizeof(timeout)))
    {
        throw std::runtime_error("setsockopt SO_RCVTIMEO failed");
    }

    sockaddr_in client_address = {};
    client_address.sin_family = AF_INET;
    client_address.sin_port = htons(0);
    client_address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (0 != bind(client_socket.Fd(),
                  reinterpret_cast<const sockaddr*>(&client_address),
                  sizeof(client_address)))
    {
        throw std::runtime_error("client bind failed");
    }

    sockaddr_in minion_address = {};
    minion_address.sin_family = AF_INET;
    minion_address.sin_port = htons(39123);
    minion_address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);

    const std::string binary_path = MinionBinaryPath();
    pid_t child = fork();
    if (child < 0)
    {
        throw std::runtime_error("fork failed");
    }

    if (0 == child)
    {
        execl(binary_path.c_str(), binary_path.c_str(),
              "--bind-ip", "127.0.0.1",
              "--port", "39123",
              "--storage-path", temp.PathName().c_str(),
              "--capacity-bytes", "4096",
              static_cast<char*>(nullptr));
        _exit(127);
    }

    int status = 0;
    try
    {
        std::this_thread::sleep_for(std::chrono::milliseconds(250));

        HeartbeatBodyV1 body;
        body.node_id = UUID(9, 8, 7, 6);
        body.heartbeat_seq = 777;
        body.health_state = HealthState::DEGRADED;

        Buffer payload_buffer;
        body.Serialize(payload_buffer);

        MessageV1 request;
        request.header.message_type = MessageType::HEARTBEAT_REQ;
        request.header.request_id = UUID(1, 2, 3, 4);
        request.header.payload_length = payload_buffer.GetSize();
        request.header.SetFlag(FLAG_HAS_PAYLOAD);
        request.payload.assign(payload_buffer.GetData(),
                               payload_buffer.GetData() + payload_buffer.GetSize());

        SendMessage(client_socket.Fd(), minion_address, request);
        const MessageV1 response = ReceiveMessage(client_socket.Fd());

        ASSERT_EQ(suite, static_cast<int>(MessageType::HEARTBEAT_RESP),
                  static_cast<int>(response.header.message_type));
        ASSERT_TRUE(suite, response.header.HasFlag(FLAG_HAS_PAYLOAD));
        ASSERT_TRUE(suite, response.header.request_id == request.header.request_id);

        Buffer ack_buffer = ilrd::wire::MakeBuffer(response.payload);
        HeartbeatAckBodyV1 ack_body;
        ack_body.Deserialize(ack_buffer);

        ASSERT_EQ(suite, 777ULL, ack_body.acked_seq);
        ASSERT_EQ(suite, static_cast<int>(HealthState::HEALTHY),
                  static_cast<int>(ack_body.accepted_state));
    }
    catch (...)
    {
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

void TestMinionStorageSmoke()
{
    INIT_SUITE(suite, "Minion Storage Smoke");
    BEGIN_SUITE(suite);

    TempBackingFile temp("minion_storage_smoke");
    UdpSocket client_socket;

    timeval timeout = {};
    timeout.tv_sec = 2;
    timeout.tv_usec = 0;
    if (0 != setsockopt(client_socket.Fd(), SOL_SOCKET, SO_RCVTIMEO, &timeout,
                        sizeof(timeout)))
    {
        throw std::runtime_error("setsockopt SO_RCVTIMEO failed");
    }

    sockaddr_in client_address = {};
    client_address.sin_family = AF_INET;
    client_address.sin_port = htons(0);
    client_address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (0 != bind(client_socket.Fd(),
                  reinterpret_cast<const sockaddr*>(&client_address),
                  sizeof(client_address)))
    {
        throw std::runtime_error("client bind failed");
    }

    sockaddr_in minion_address = {};
    minion_address.sin_family = AF_INET;
    minion_address.sin_port = htons(39124);
    minion_address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);

    const std::string binary_path = MinionBinaryPath();
    pid_t child = fork();
    if (child < 0)
    {
        throw std::runtime_error("fork failed");
    }

    if (0 == child)
    {
        execl(binary_path.c_str(), binary_path.c_str(),
              "--bind-ip", "127.0.0.1",
              "--port", "39124",
              "--storage-path", temp.PathName().c_str(),
              "--capacity-bytes", "4096",
              static_cast<char*>(nullptr));
        _exit(127);
    }

    int status = 0;
    try
    {
        std::this_thread::sleep_for(std::chrono::milliseconds(250));

        const std::vector<std::uint8_t> payload = {0xCA, 0xFE, 0xBA, 0xBE};

        MessageV1 write_request;
        write_request.header.message_type = MessageType::WRITE_REQ;
        write_request.header.request_id = UUID(11, 22, 33, 44);
        write_request.header.logical_offset = 128;
        write_request.header.operation_length =
            static_cast<std::uint32_t>(payload.size());
        write_request.header.payload_length =
            static_cast<std::uint32_t>(payload.size());
        write_request.header.SetFlag(FLAG_HAS_PAYLOAD);
        write_request.payload = payload;

        SendMessage(client_socket.Fd(), minion_address, write_request);
        const MessageV1 write_response = ReceiveMessage(client_socket.Fd());

        ASSERT_EQ(suite, static_cast<int>(MessageType::WRITE_RESP),
                  static_cast<int>(write_response.header.message_type));
        ASSERT_EQ(suite, static_cast<int>(StatusCode::OK),
                  static_cast<int>(write_response.header.status_code));
        ASSERT_TRUE(suite,
                    write_response.header.request_id ==
                        write_request.header.request_id);

        MessageV1 read_request;
        read_request.header.message_type = MessageType::READ_REQ;
        read_request.header.request_id = UUID(55, 66, 77, 88);
        read_request.header.logical_offset = 128;
        read_request.header.operation_length =
            static_cast<std::uint32_t>(payload.size());

        SendMessage(client_socket.Fd(), minion_address, read_request);
        const MessageV1 read_response = ReceiveMessage(client_socket.Fd());

        ASSERT_EQ(suite, static_cast<int>(MessageType::READ_RESP),
                  static_cast<int>(read_response.header.message_type));
        ASSERT_EQ(suite, static_cast<int>(StatusCode::OK),
                  static_cast<int>(read_response.header.status_code));
        ASSERT_TRUE(suite, read_response.header.HasFlag(FLAG_HAS_PAYLOAD));
        ASSERT_EQ(suite, payload.size(), read_response.payload.size());
        ASSERT_EQ(suite, 0xCA, read_response.payload[0]);
        ASSERT_EQ(suite, 0xBE, read_response.payload[3]);

        MessageV1 flush_request;
        flush_request.header.message_type = MessageType::FLUSH_REQ;
        flush_request.header.request_id = UUID(99, 88, 77, 66);

        SendMessage(client_socket.Fd(), minion_address, flush_request);
        const MessageV1 flush_response = ReceiveMessage(client_socket.Fd());

        ASSERT_EQ(suite, static_cast<int>(MessageType::FLUSH_RESP),
                  static_cast<int>(flush_response.header.message_type));
        ASSERT_EQ(suite, static_cast<int>(StatusCode::OK),
                  static_cast<int>(flush_response.header.status_code));
        ASSERT_TRUE(suite,
                    flush_response.header.request_id ==
                        flush_request.header.request_id);
    }
    catch (...)
    {
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
    PRINT_TEST_HEADER("Minion Smoke");
    TestMinionHeartbeatSmoke();
    TestMinionStorageSmoke();
    PRINT_SUMMARY();
    return 0;
}
