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
#include "response/ResponseManager.hpp"
#include "serialization/Serializer.hpp"
#include "transport/MinionProxy.hpp"
#include "transport/MinionResponseProxy.hpp"
#include "wire/WireProtocol.hpp"
#include "test_utils.hpp"

namespace
{

using ilrd::Buffer;
using ilrd::ITask;
using ilrd::UUID;
using ilrd::concrete::MinionProxy;
using ilrd::concrete::MinionResponseProxy;
using ilrd::concrete::ResponseManager;
using ilrd::wire::FLAG_HAS_PAYLOAD;
using ilrd::wire::FLAG_RESPONSE;
using ilrd::wire::HealthState;
using ilrd::wire::MessageType;
using ilrd::wire::MessageV1;
using ilrd::wire::StatusCode;

struct CallbackCapture
{
    std::size_t count = 0;
    ResponseManager::ResponseCompletion completion = {};

    ResponseManager::CompletionCallback Callback()
    {
        return [this](const ResponseManager::ResponseCompletion& result)
        {
            ++count;
            completion = result;
        };
    }
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

MessageV1 MakeWriteResponse(const UUID& request_id,
                             StatusCode status = StatusCode::OK)
{
    MessageV1 response;
    response.header.message_type = MessageType::WRITE_RESP;
    response.header.SetFlag(FLAG_RESPONSE);
    response.header.status_code = status;
    response.header.request_id = request_id;
    response.header.logical_offset = 128;
    response.header.operation_length = 4;
    return response;
}

void TestValidResponseCompletesRequest()
{
    INIT_SUITE(suite, "MinionResponseProxy Valid Response");
    BEGIN_SUITE(suite);

    UdpSocket master;
    UdpSocket minion;
    master.BindLoopback();
    minion.BindLoopback();

    ResponseManager manager;
    CallbackCapture capture;
    const UUID request_id(1, 2, 3, 4);
    manager.RegisterRequest(request_id, MessageType::WRITE_RESP,
                            capture.Callback());

    MinionResponseProxy proxy(master.Fd(), "127.0.0.1", minion.Port(),
                              manager);
    SendMessage(minion.Fd(), master.Address(), MakeWriteResponse(request_id));

    ITask* task = proxy.GetTask(master.Fd());

    ASSERT_NULL(suite, task);
    ASSERT_EQ(suite, 1u, capture.count);
    ASSERT_EQ(suite, static_cast<int>(ResponseManager::State::COMPLETED),
              static_cast<int>(capture.completion.state));
    ASSERT_TRUE(suite, capture.completion.request_id == request_id);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestRejectRequestDatagram()
{
    INIT_SUITE(suite, "MinionResponseProxy Reject Request");
    BEGIN_SUITE(suite);

    UdpSocket master;
    UdpSocket minion;
    master.BindLoopback();
    minion.BindLoopback();

    ResponseManager manager;
    CallbackCapture capture;
    const UUID request_id(2, 3, 4, 5);
    manager.RegisterRequest(request_id, MessageType::WRITE_RESP,
                            capture.Callback());

    MinionResponseProxy proxy(master.Fd(), "127.0.0.1", minion.Port(),
                              manager);

    MessageV1 request;
    request.header.message_type = MessageType::FLUSH_REQ;
    request.header.request_id = request_id;
    SendMessage(minion.Fd(), master.Address(), request);

    ASSERT_NULL(suite, proxy.GetTask(master.Fd()));
    ASSERT_EQ(suite, 0u, capture.count);
    ASSERT_EQ(suite, 1u, manager.PendingCount());

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestRejectMalformedDatagram()
{
    INIT_SUITE(suite, "MinionResponseProxy Reject Malformed");
    BEGIN_SUITE(suite);

    UdpSocket master;
    UdpSocket minion;
    master.BindLoopback();
    minion.BindLoopback();

    ResponseManager manager;
    CallbackCapture capture;
    const UUID request_id(3, 4, 5, 6);
    manager.RegisterRequest(request_id, MessageType::WRITE_RESP,
                            capture.Callback());

    MinionResponseProxy proxy(master.Fd(), "127.0.0.1", minion.Port(),
                              manager);

    const std::vector<std::uint8_t> bytes(8, 0xAB);
    const sockaddr_in master_address = master.Address();
    const ssize_t bytes_sent =
        sendto(minion.Fd(), bytes.data(), bytes.size(), 0,
               reinterpret_cast<const sockaddr*>(&master_address),
               sizeof(master_address));
    ASSERT_EQ(suite, static_cast<ssize_t>(bytes.size()), bytes_sent);

    ASSERT_NULL(suite, proxy.GetTask(master.Fd()));
    ASSERT_EQ(suite, 0u, capture.count);
    ASSERT_EQ(suite, 1u, manager.PendingCount());

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestRejectUnexpectedEndpoint()
{
    INIT_SUITE(suite, "MinionResponseProxy Reject Endpoint");
    BEGIN_SUITE(suite);

    UdpSocket master;
    UdpSocket minion;
    UdpSocket intruder;
    master.BindLoopback();
    minion.BindLoopback();
    intruder.BindLoopback();

    ResponseManager manager;
    CallbackCapture capture;
    const UUID request_id(4, 5, 6, 7);
    manager.RegisterRequest(request_id, MessageType::WRITE_RESP,
                            capture.Callback());

    MinionResponseProxy proxy(master.Fd(), "127.0.0.1", minion.Port(),
                              manager);
    SendMessage(intruder.Fd(), master.Address(), MakeWriteResponse(request_id));

    ASSERT_NULL(suite, proxy.GetTask(master.Fd()));
    ASSERT_EQ(suite, 0u, capture.count);
    ASSERT_EQ(suite, 1u, manager.PendingCount());

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestAcceptKnownEndpointFromAllowlist()
{
    INIT_SUITE(suite, "MinionResponseProxy Allowlist");
    BEGIN_SUITE(suite);

    UdpSocket master;
    UdpSocket first;
    UdpSocket second;
    master.BindLoopback();
    first.BindLoopback();
    second.BindLoopback();

    ResponseManager manager;
    CallbackCapture capture;
    const UUID request_id(8, 9, 10, 11);
    manager.RegisterRequest(request_id, MessageType::WRITE_RESP,
                            capture.Callback());

    std::vector<MinionResponseProxy::Endpoint> endpoints;
    endpoints.push_back(MinionResponseProxy::Endpoint("127.0.0.1",
                                                      first.Port()));
    endpoints.push_back(MinionResponseProxy::Endpoint("127.0.0.1",
                                                      second.Port()));
    MinionResponseProxy proxy(master.Fd(), endpoints, manager);
    SendMessage(second.Fd(), master.Address(), MakeWriteResponse(request_id));

    ASSERT_NULL(suite, proxy.GetTask(master.Fd()));
    ASSERT_EQ(suite, 1u, capture.count);
    ASSERT_EQ(suite, 0u, manager.PendingCount());

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestIntegrationWithMinion()
{
    INIT_SUITE(suite, "MinionResponseProxy Minion Integration");
    BEGIN_SUITE(suite);

    const std::uint16_t minion_port = ReserveUdpPort();
    TempBackingFile temp("minion_response_proxy");
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

        ResponseManager manager;
        MinionProxy sender(master.Fd(), "127.0.0.1", minion_port);
        MinionResponseProxy receiver(master.Fd(), "127.0.0.1", minion_port,
                                     manager);

        CallbackCapture write_capture;
        const UUID write_id(10, 20, 30, 40);
        manager.RegisterRequest(write_id, MessageType::WRITE_RESP,
                                write_capture.Callback());
        sender.SendWriteRequest(128, std::vector<std::uint8_t>{1, 2, 3, 4},
                                write_id);

        ASSERT_NULL(suite, receiver.GetTask(master.Fd()));
        ASSERT_EQ(suite, 1u, write_capture.count);
        ASSERT_EQ(suite, static_cast<int>(ResponseManager::State::COMPLETED),
                  static_cast<int>(write_capture.completion.state));

        CallbackCapture read_capture;
        const UUID read_id(11, 21, 31, 41);
        manager.RegisterRequest(read_id, MessageType::READ_RESP,
                                read_capture.Callback());
        sender.SendReadRequest(128, 4, read_id);

        ASSERT_NULL(suite, receiver.GetTask(master.Fd()));
        ASSERT_EQ(suite, 1u, read_capture.count);
        ASSERT_EQ(suite, static_cast<int>(ResponseManager::State::COMPLETED),
                  static_cast<int>(read_capture.completion.state));
        ASSERT_EQ(suite, 4u, read_capture.completion.payload.size());
        ASSERT_EQ(suite, 1, read_capture.completion.payload[0]);
        ASSERT_EQ(suite, 4, read_capture.completion.payload[3]);
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
    PRINT_TEST_HEADER("MinionResponseProxy");

    TestValidResponseCompletesRequest();
    TestRejectRequestDatagram();
    TestRejectMalformedDatagram();
    TestRejectUnexpectedEndpoint();
    TestAcceptKnownEndpointFromAllowlist();
    TestIntegrationWithMinion();

    PRINT_SUMMARY();

    return 0;
}
