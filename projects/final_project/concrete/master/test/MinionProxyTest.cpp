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
#include "serialization/Serializer.hpp"
#include "transport/MinionProxy.hpp"
#include "wire/WireProtocol.hpp"
#include "test_utils.hpp"

namespace
{

using ilrd::Buffer;
using ilrd::UUID;
using ilrd::concrete::MinionProxy;
using ilrd::wire::FLAG_HAS_PAYLOAD;
using ilrd::wire::FLAG_RESPONSE;
using ilrd::wire::HealthState;
using ilrd::wire::HeartbeatAckBodyV1;
using ilrd::wire::HeartbeatBodyV1;
using ilrd::wire::MessageType;
using ilrd::wire::MessageV1;
using ilrd::wire::StatusCode;

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

MessageV1 MakeReadResponse(const UUID& request_id,
                            std::uint64_t offset,
                            const std::vector<std::uint8_t>& payload)
{
    MessageV1 response;
    response.header.message_type = MessageType::READ_RESP;
    response.header.SetFlag(FLAG_RESPONSE);
    response.header.SetFlag(FLAG_HAS_PAYLOAD);
    response.header.request_id = request_id;
    response.header.logical_offset = offset;
    response.header.operation_length = static_cast<std::uint32_t>(payload.size());
    response.header.payload_length = static_cast<std::uint32_t>(payload.size());
    response.payload = payload;
    return response;
}

MessageV1 MakeWriteResponse(const UUID& request_id,
                             std::uint64_t offset,
                             std::uint32_t length)
{
    MessageV1 response;
    response.header.message_type = MessageType::WRITE_RESP;
    response.header.SetFlag(FLAG_RESPONSE);
    response.header.request_id = request_id;
    response.header.logical_offset = offset;
    response.header.operation_length = length;
    return response;
}

void TestSendReadRequest()
{
    INIT_SUITE(suite, "MinionProxy Send Read Request");
    BEGIN_SUITE(suite);

    UdpSocket master;
    UdpSocket minion;
    master.BindLoopback();
    minion.BindLoopback();

    MinionProxy proxy(master.Fd(), "127.0.0.1", minion.Port());
    const UUID request_id(1, 2, 3, 4);
    const UUID returned = proxy.SendReadRequest(1234, 64, request_id);
    const MessageV1 request = ReceiveMessage(minion.Fd());

    ASSERT_TRUE(suite, returned == request_id);
    ASSERT_EQ(suite, static_cast<int>(MessageType::READ_REQ),
              static_cast<int>(request.header.message_type));
    ASSERT_TRUE(suite, request.header.request_id == request_id);
    ASSERT_EQ(suite, 1234ULL, request.header.logical_offset);
    ASSERT_EQ(suite, 64u, request.header.operation_length);
    ASSERT_EQ(suite, 0u, request.payload.size());

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestSendWriteRequest()
{
    INIT_SUITE(suite, "MinionProxy Send Write Request");
    BEGIN_SUITE(suite);

    UdpSocket master;
    UdpSocket minion;
    master.BindLoopback();
    minion.BindLoopback();

    MinionProxy proxy(master.Fd(), "127.0.0.1", minion.Port());
    const UUID request_id(2, 3, 4, 5);
    const std::vector<std::uint8_t> payload = {0x10, 0x20, 0x30};
    proxy.SendWriteRequest(88, payload, request_id);
    const MessageV1 request = ReceiveMessage(minion.Fd());

    ASSERT_EQ(suite, static_cast<int>(MessageType::WRITE_REQ),
              static_cast<int>(request.header.message_type));
    ASSERT_TRUE(suite, request.header.HasFlag(FLAG_HAS_PAYLOAD));
    ASSERT_TRUE(suite, request.header.request_id == request_id);
    ASSERT_EQ(suite, 88ULL, request.header.logical_offset);
    ASSERT_EQ(suite, payload.size(), request.payload.size());
    ASSERT_EQ(suite, 0x10, request.payload[0]);
    ASSERT_EQ(suite, 0x30, request.payload[2]);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestSendFlushRequest()
{
    INIT_SUITE(suite, "MinionProxy Send Flush Request");
    BEGIN_SUITE(suite);

    UdpSocket master;
    UdpSocket minion;
    master.BindLoopback();
    minion.BindLoopback();

    MinionProxy proxy(master.Fd(), "127.0.0.1", minion.Port());
    const UUID request_id(3, 4, 5, 6);
    proxy.SendFlushRequest(request_id);
    const MessageV1 request = ReceiveMessage(minion.Fd());

    ASSERT_EQ(suite, static_cast<int>(MessageType::FLUSH_REQ),
              static_cast<int>(request.header.message_type));
    ASSERT_TRUE(suite, request.header.request_id == request_id);
    ASSERT_EQ(suite, 0u, request.header.operation_length);
    ASSERT_EQ(suite, 0u, request.payload.size());

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestSendHeartbeatRequest()
{
    INIT_SUITE(suite, "MinionProxy Send Heartbeat Request");
    BEGIN_SUITE(suite);

    UdpSocket master;
    UdpSocket minion;
    master.BindLoopback();
    minion.BindLoopback();

    MinionProxy proxy(master.Fd(), "127.0.0.1", minion.Port());
    const UUID node_id(8, 7, 6, 5);
    const UUID request_id(4, 5, 6, 7);
    proxy.SendHeartbeatRequest(node_id, 900, HealthState::DEGRADED, request_id);
    const MessageV1 request = ReceiveMessage(minion.Fd());

    ASSERT_EQ(suite, static_cast<int>(MessageType::HEARTBEAT_REQ),
              static_cast<int>(request.header.message_type));
    ASSERT_TRUE(suite, request.header.HasFlag(FLAG_HAS_PAYLOAD));
    ASSERT_TRUE(suite, request.header.request_id == request_id);

    Buffer body_buffer = ilrd::wire::MakeBuffer(request.payload);
    HeartbeatBodyV1 body;
    body.Deserialize(body_buffer);
    ASSERT_TRUE(suite, body.node_id == node_id);
    ASSERT_EQ(suite, 900ULL, body.heartbeat_seq);
    ASSERT_EQ(suite, static_cast<int>(HealthState::DEGRADED),
              static_cast<int>(body.health_state));

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestReceiveResponse()
{
    INIT_SUITE(suite, "MinionProxy Receive Response");
    BEGIN_SUITE(suite);

    UdpSocket master;
    UdpSocket minion;
    master.BindLoopback();
    minion.BindLoopback();

    MinionProxy proxy(master.Fd(), "127.0.0.1", minion.Port());
    const UUID request_id(5, 6, 7, 8);
    const std::vector<std::uint8_t> payload = {'o', 'k'};
    SendMessage(minion.Fd(), master.Address(),
                MakeReadResponse(request_id, 700, payload));

    MessageV1 response;
    const bool received =
        proxy.ReceiveResponse(response, std::chrono::milliseconds(100));

    ASSERT_TRUE(suite, received);
    ASSERT_EQ(suite, static_cast<int>(MessageType::READ_RESP),
              static_cast<int>(response.header.message_type));
    ASSERT_TRUE(suite, response.header.request_id == request_id);
    ASSERT_EQ(suite, payload.size(), response.payload.size());
    ASSERT_EQ(suite, 'o', response.payload[0]);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestReceiveTimeout()
{
    INIT_SUITE(suite, "MinionProxy Receive Timeout");
    BEGIN_SUITE(suite);

    UdpSocket master;
    UdpSocket minion;
    master.BindLoopback();
    minion.BindLoopback();

    MinionProxy proxy(master.Fd(), "127.0.0.1", minion.Port());
    MessageV1 response;

    ASSERT_FALSE(suite,
                 proxy.ReceiveResponse(response, std::chrono::milliseconds(20)));

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestRejectUnexpectedEndpoint()
{
    INIT_SUITE(suite, "MinionProxy Reject Unexpected Endpoint");
    BEGIN_SUITE(suite);

    UdpSocket master;
    UdpSocket minion;
    UdpSocket intruder;
    master.BindLoopback();
    minion.BindLoopback();
    intruder.BindLoopback();

    MinionProxy proxy(master.Fd(), "127.0.0.1", minion.Port());
    SendMessage(intruder.Fd(), master.Address(),
                MakeWriteResponse(UUID(6, 7, 8, 9), 10, 3));

    MessageV1 response;
    ASSERT_FALSE(suite,
                 proxy.ReceiveResponse(response, std::chrono::milliseconds(100)));

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestRejectRequestDatagram()
{
    INIT_SUITE(suite, "MinionProxy Reject Request Datagram");
    BEGIN_SUITE(suite);

    UdpSocket master;
    UdpSocket minion;
    master.BindLoopback();
    minion.BindLoopback();

    MinionProxy proxy(master.Fd(), "127.0.0.1", minion.Port());

    MessageV1 request;
    request.header.message_type = MessageType::FLUSH_REQ;
    request.header.request_id = UUID(7, 8, 9, 10);
    SendMessage(minion.Fd(), master.Address(), request);

    MessageV1 response;
    ASSERT_FALSE(suite,
                 proxy.ReceiveResponse(response, std::chrono::milliseconds(100)));

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestRejectMalformedDatagram()
{
    INIT_SUITE(suite, "MinionProxy Reject Malformed Datagram");
    BEGIN_SUITE(suite);

    UdpSocket master;
    UdpSocket minion;
    master.BindLoopback();
    minion.BindLoopback();

    MinionProxy proxy(master.Fd(), "127.0.0.1", minion.Port());
    const std::vector<std::uint8_t> bytes(8, 0xAB);
    const sockaddr_in master_address = master.Address();
    const ssize_t bytes_sent =
        sendto(minion.Fd(), bytes.data(), bytes.size(), 0,
               reinterpret_cast<const sockaddr*>(&master_address),
               sizeof(sockaddr_in));
    ASSERT_EQ(suite, static_cast<ssize_t>(bytes.size()), bytes_sent);

    MessageV1 response;
    ASSERT_FALSE(suite,
                 proxy.ReceiveResponse(response, std::chrono::milliseconds(100)));

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestMinionIntegration()
{
    INIT_SUITE(suite, "MinionProxy Minion Integration");
    BEGIN_SUITE(suite);

    const std::uint16_t minion_port = ReserveUdpPort();
    TempBackingFile temp("minion_proxy_integration");
    UdpSocket master;
    master.BindLoopback();

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
        MinionProxy proxy(master.Fd(), "127.0.0.1", minion_port);

        const std::vector<std::uint8_t> payload = {0xCA, 0xFE, 0xBA, 0xBE};
        const UUID write_id(10, 20, 30, 40);
        proxy.SendWriteRequest(128, payload, write_id);

        MessageV1 write_response;
        ASSERT_TRUE(suite, proxy.ReceiveResponse(
                               write_response, std::chrono::milliseconds(1000)));
        ASSERT_EQ(suite, static_cast<int>(MessageType::WRITE_RESP),
                  static_cast<int>(write_response.header.message_type));
        ASSERT_EQ(suite, static_cast<int>(StatusCode::OK),
                  static_cast<int>(write_response.header.status_code));
        ASSERT_TRUE(suite, write_response.header.request_id == write_id);

        const UUID read_id(11, 21, 31, 41);
        proxy.SendReadRequest(128, static_cast<std::uint32_t>(payload.size()),
                              read_id);
        MessageV1 read_response;
        ASSERT_TRUE(suite, proxy.ReceiveResponse(
                               read_response, std::chrono::milliseconds(1000)));
        ASSERT_EQ(suite, static_cast<int>(MessageType::READ_RESP),
                  static_cast<int>(read_response.header.message_type));
        ASSERT_EQ(suite, static_cast<int>(StatusCode::OK),
                  static_cast<int>(read_response.header.status_code));
        ASSERT_TRUE(suite, read_response.header.request_id == read_id);
        ASSERT_EQ(suite, payload.size(), read_response.payload.size());
        ASSERT_EQ(suite, 0xCA, read_response.payload[0]);
        ASSERT_EQ(suite, 0xBE, read_response.payload[3]);

        const UUID flush_id(12, 22, 32, 42);
        proxy.SendFlushRequest(flush_id);
        MessageV1 flush_response;
        ASSERT_TRUE(suite, proxy.ReceiveResponse(
                               flush_response, std::chrono::milliseconds(1000)));
        ASSERT_EQ(suite, static_cast<int>(MessageType::FLUSH_RESP),
                  static_cast<int>(flush_response.header.message_type));
        ASSERT_TRUE(suite, flush_response.header.request_id == flush_id);

        const UUID heartbeat_id(13, 23, 33, 43);
        const UUID node_id(14, 24, 34, 44);
        proxy.SendHeartbeatRequest(node_id, 777, HealthState::HEALTHY,
                                   heartbeat_id);
        MessageV1 heartbeat_response;
        ASSERT_TRUE(suite, proxy.ReceiveResponse(
                               heartbeat_response,
                               std::chrono::milliseconds(1000)));
        ASSERT_EQ(suite, static_cast<int>(MessageType::HEARTBEAT_RESP),
                  static_cast<int>(heartbeat_response.header.message_type));
        ASSERT_TRUE(suite,
                    heartbeat_response.header.request_id == heartbeat_id);
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
    PRINT_TEST_HEADER("MinionProxy");

    TestSendReadRequest();
    TestSendWriteRequest();
    TestSendFlushRequest();
    TestSendHeartbeatRequest();
    TestReceiveResponse();
    TestReceiveTimeout();
    TestRejectUnexpectedEndpoint();
    TestRejectRequestDatagram();
    TestRejectMalformedDatagram();
    TestMinionIntegration();

    PRINT_SUMMARY();

    return 0;
}
