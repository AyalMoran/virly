#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <vector>

#include <sys/socket.h>
#include <unistd.h>

#include "Logger.hpp"
#include "transport/MasterProxy.hpp"
#include "test_utils.hpp"

namespace
{

using ilrd::Buffer;
using ilrd::ITask;
using ilrd::Logger;
using ilrd::UUID;
using ilrd::concrete::FlushTask;
using ilrd::concrete::HeartbeatTask;
using ilrd::concrete::MasterProxy;
using ilrd::concrete::ReadTask;
using ilrd::concrete::WriteTask;
using ilrd::wire::FLAG_HAS_PAYLOAD;
using ilrd::wire::FLAG_RESPONSE;
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

    std::vector<std::string> Snapshot() const
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        return m_lines;
    }

  private:
    mutable std::mutex m_mutex;
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

    void CloseSecond()
    {
        if (-1 != m_fds[1])
        {
            close(m_fds[1]);
            m_fds[1] = -1;
        }
    }

    void SendToFirst(const std::vector<std::uint8_t>& bytes) const
    {
        const ssize_t bytes_sent =
            send(m_fds[1], bytes.data(), bytes.size(), 0);
        if (bytes_sent != static_cast<ssize_t>(bytes.size()))
        {
            throw std::runtime_error("send to first failed");
        }
    }

    void SendToFirst(const MessageV1& message) const
    {
        Buffer buffer;
        message.Serialize(buffer);
        SendToFirst(std::vector<std::uint8_t>(buffer.GetData(),
                                              buffer.GetData() + buffer.GetSize()));
    }

    MessageV1 ReceiveOnSecond() const
    {
        std::vector<std::uint8_t> bytes(2048, 0);
        const ssize_t bytes_read =
            recv(m_fds[1], bytes.data(), bytes.size(), 0);
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

std::shared_ptr<VectorSink> InstallVectorSink()
{
    std::shared_ptr<VectorSink> sink(new VectorSink());
    Logger::Instance().SetSink(sink);
    return sink;
}

void TestReadRequestParsing()
{
    INIT_SUITE(suite, "MasterProxy Read Request");
    BEGIN_SUITE(suite);

    DatagramPair pair;
    MasterProxy proxy(pair.FirstFd());

    MessageV1 request;
    request.header.message_type = MessageType::READ_REQ;
    request.header.request_id = UUID(1, 2, 3, 4);
    request.header.logical_offset = 1234;
    request.header.operation_length = 64;
    pair.SendToFirst(request);

    std::unique_ptr<ITask> task(proxy.GetTask(pair.FirstFd()));
    ReadTask* read_task = dynamic_cast<ReadTask*>(task.get());

    ASSERT_NOT_NULL(suite, read_task);
    ASSERT_EQ(suite, 1234ULL, read_task->GetLogicalOffset());
    ASSERT_EQ(suite, 64u, read_task->GetOperationLength());
    ASSERT_TRUE(suite, read_task->GetRequestId() == request.header.request_id);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestWriteRequestParsing()
{
    INIT_SUITE(suite, "MasterProxy Write Request");
    BEGIN_SUITE(suite);

    DatagramPair pair;
    MasterProxy proxy(pair.FirstFd());

    MessageV1 request;
    request.header.message_type = MessageType::WRITE_REQ;
    request.header.request_id = UUID(10, 20, 30, 40);
    request.header.logical_offset = 5678;
    request.header.operation_length = 3;
    request.header.payload_length = 3;
    request.header.SetFlag(FLAG_HAS_PAYLOAD);
    request.payload.push_back(0x11);
    request.payload.push_back(0x22);
    request.payload.push_back(0x33);
    pair.SendToFirst(request);

    std::unique_ptr<ITask> task(proxy.GetTask(pair.FirstFd()));
    WriteTask* write_task = dynamic_cast<WriteTask*>(task.get());

    ASSERT_NOT_NULL(suite, write_task);
    ASSERT_EQ(suite, 3u, write_task->GetData().size());
    ASSERT_EQ(suite, 0x11, write_task->GetData()[0]);
    ASSERT_EQ(suite, 0x33, write_task->GetData()[2]);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestHeartbeatRequestParsing()
{
    INIT_SUITE(suite, "MasterProxy Heartbeat Request");
    BEGIN_SUITE(suite);

    DatagramPair pair;
    MasterProxy proxy(pair.FirstFd());

    HeartbeatBodyV1 body;
    body.node_id = UUID(8, 7, 6, 5);
    body.heartbeat_seq = 900;
    body.health_state = HealthState::DEGRADED;

    Buffer payload_buffer;
    body.Serialize(payload_buffer);

    MessageV1 request;
    request.header.message_type = MessageType::HEARTBEAT_REQ;
    request.header.payload_length = payload_buffer.GetSize();
    request.header.SetFlag(FLAG_HAS_PAYLOAD);
    request.payload.assign(payload_buffer.GetData(),
                           payload_buffer.GetData() + payload_buffer.GetSize());
    pair.SendToFirst(request);

    std::unique_ptr<ITask> task(proxy.GetTask(pair.FirstFd()));
    HeartbeatTask* heartbeat_task = dynamic_cast<HeartbeatTask*>(task.get());

    ASSERT_NOT_NULL(suite, heartbeat_task);
    ASSERT_EQ(suite, 900ULL, heartbeat_task->GetBody().heartbeat_seq);
    ASSERT_EQ(suite, static_cast<int>(HealthState::DEGRADED),
              static_cast<int>(heartbeat_task->GetBody().health_state));

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestDropResponseDatagram()
{
    INIT_SUITE(suite, "MasterProxy Drops Response");
    BEGIN_SUITE(suite);

    DatagramPair pair;
    MasterProxy proxy(pair.FirstFd());
    std::shared_ptr<VectorSink> sink = InstallVectorSink();

    MessageV1 response;
    response.header.message_type = MessageType::WRITE_RESP;
    response.header.flags = static_cast<std::uint16_t>(FLAG_RESPONSE);
    response.header.status_code = StatusCode::OK;
    response.header.operation_length = 1;
    pair.SendToFirst(response);

    std::unique_ptr<ITask> task(proxy.GetTask(pair.FirstFd()));
    Logger::Instance().Flush();
    const std::vector<std::string> lines = sink->Snapshot();

    ASSERT_NULL(suite, task.get());
    ASSERT_FALSE(suite, lines.empty());

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestDropMalformedDatagram()
{
    INIT_SUITE(suite, "MasterProxy Drops Malformed");
    BEGIN_SUITE(suite);

    DatagramPair pair;
    MasterProxy proxy(pair.FirstFd());
    std::shared_ptr<VectorSink> sink = InstallVectorSink();

    std::vector<std::uint8_t> bytes(8, 0xAB);
    pair.SendToFirst(bytes);

    std::unique_ptr<ITask> task(proxy.GetTask(pair.FirstFd()));
    Logger::Instance().Flush();
    const std::vector<std::string> lines = sink->Snapshot();

    ASSERT_NULL(suite, task.get());
    ASSERT_FALSE(suite, lines.empty());

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestSendReadResponse()
{
    INIT_SUITE(suite, "MasterProxy Send Read Response");
    BEGIN_SUITE(suite);

    DatagramPair pair;
    MasterProxy proxy(pair.FirstFd());

    MessageV1 request;
    request.header.message_type = MessageType::READ_REQ;
    request.header.request_id = UUID(1, 1, 1, 1);
    request.header.logical_offset = 300;
    request.header.operation_length = 4;
    pair.SendToFirst(request);

    std::unique_ptr<ITask> task(proxy.GetTask(pair.FirstFd()));
    ReadTask* read_task = dynamic_cast<ReadTask*>(task.get());
    ASSERT_NOT_NULL(suite, read_task);

    std::vector<std::uint8_t> payload;
    payload.push_back('d');
    payload.push_back('a');
    payload.push_back('t');
    payload.push_back('a');

    proxy.SendReadResponse(*read_task, StatusCode::OK, payload);
    MessageV1 response = pair.ReceiveOnSecond();

    ASSERT_EQ(suite, static_cast<int>(MessageType::READ_RESP),
              static_cast<int>(response.header.message_type));
    ASSERT_TRUE(suite, response.header.HasFlag(FLAG_RESPONSE));
    ASSERT_TRUE(suite, response.header.HasFlag(FLAG_HAS_PAYLOAD));
    ASSERT_EQ(suite, 4u, response.payload.size());
    ASSERT_TRUE(suite, response.header.request_id == read_task->GetRequestId());

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestSendWriteResponse()
{
    INIT_SUITE(suite, "MasterProxy Send Write Response");
    BEGIN_SUITE(suite);

    DatagramPair pair;
    MasterProxy proxy(pair.FirstFd());

    MessageV1 request;
    request.header.message_type = MessageType::WRITE_REQ;
    request.header.request_id = UUID(2, 2, 2, 2);
    request.header.logical_offset = 900;
    request.header.operation_length = 2;
    request.header.payload_length = 2;
    request.header.SetFlag(FLAG_HAS_PAYLOAD);
    request.payload.push_back(0x01);
    request.payload.push_back(0x02);
    pair.SendToFirst(request);

    std::unique_ptr<ITask> task(proxy.GetTask(pair.FirstFd()));
    WriteTask* write_task = dynamic_cast<WriteTask*>(task.get());
    ASSERT_NOT_NULL(suite, write_task);

    proxy.SendWriteResponse(*write_task, StatusCode::OK);
    MessageV1 response = pair.ReceiveOnSecond();

    ASSERT_EQ(suite, static_cast<int>(MessageType::WRITE_RESP),
              static_cast<int>(response.header.message_type));
    ASSERT_TRUE(suite, response.header.HasFlag(FLAG_RESPONSE));
    ASSERT_FALSE(suite, response.header.HasFlag(FLAG_HAS_PAYLOAD));
    ASSERT_EQ(suite, 0u, response.payload.size());
    ASSERT_TRUE(suite, response.header.request_id == write_task->GetRequestId());

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestSendFlushResponse()
{
    INIT_SUITE(suite, "MasterProxy Send Flush Response");
    BEGIN_SUITE(suite);

    DatagramPair pair;
    MasterProxy proxy(pair.FirstFd());

    MessageV1 request;
    request.header.message_type = MessageType::FLUSH_REQ;
    request.header.request_id = UUID(3, 3, 3, 3);
    pair.SendToFirst(request);

    std::unique_ptr<ITask> task(proxy.GetTask(pair.FirstFd()));
    FlushTask* flush_task = dynamic_cast<FlushTask*>(task.get());
    ASSERT_NOT_NULL(suite, flush_task);

    proxy.SendFlushResponse(*flush_task, StatusCode::OK);
    MessageV1 response = pair.ReceiveOnSecond();

    ASSERT_EQ(suite, static_cast<int>(MessageType::FLUSH_RESP),
              static_cast<int>(response.header.message_type));
    ASSERT_TRUE(suite, response.header.HasFlag(FLAG_RESPONSE));
    ASSERT_EQ(suite, 0u, response.payload.size());
    ASSERT_TRUE(suite,
                response.header.request_id == flush_task->GetRequestId());

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestSendHeartbeatResponse()
{
    INIT_SUITE(suite, "MasterProxy Send Heartbeat Response");
    BEGIN_SUITE(suite);

    DatagramPair pair;
    MasterProxy proxy(pair.FirstFd());

    HeartbeatBodyV1 request_body;
    request_body.node_id = UUID(7, 7, 7, 7);
    request_body.heartbeat_seq = 555;
    request_body.health_state = HealthState::DEGRADED;

    Buffer payload_buffer;
    request_body.Serialize(payload_buffer);

    MessageV1 request;
    request.header.message_type = MessageType::HEARTBEAT_REQ;
    request.header.request_id = UUID(4, 4, 4, 4);
    request.header.payload_length = payload_buffer.GetSize();
    request.header.SetFlag(FLAG_HAS_PAYLOAD);
    request.payload.assign(payload_buffer.GetData(),
                           payload_buffer.GetData() + payload_buffer.GetSize());
    pair.SendToFirst(request);

    std::unique_ptr<ITask> task(proxy.GetTask(pair.FirstFd()));
    HeartbeatTask* heartbeat_task = dynamic_cast<HeartbeatTask*>(task.get());
    ASSERT_NOT_NULL(suite, heartbeat_task);

    HeartbeatAckBodyV1 ack_body;
    ack_body.node_id = UUID(1, 1, 1, 1);
    ack_body.acked_seq = 555;
    ack_body.accepted_state = HealthState::HEALTHY;

    proxy.SendHeartbeatResponse(*heartbeat_task, StatusCode::OK, ack_body);
    MessageV1 response = pair.ReceiveOnSecond();

    ASSERT_EQ(suite, static_cast<int>(MessageType::HEARTBEAT_RESP),
              static_cast<int>(response.header.message_type));
    ASSERT_TRUE(suite, response.header.HasFlag(FLAG_RESPONSE));
    ASSERT_TRUE(suite, response.header.HasFlag(FLAG_HAS_PAYLOAD));
    ASSERT_TRUE(suite, response.header.request_id == heartbeat_task->GetRequestId());

    Buffer ack_buffer = ilrd::wire::MakeBuffer(response.payload);
    HeartbeatAckBodyV1 decoded_ack;
    decoded_ack.Deserialize(ack_buffer);
    ASSERT_TRUE(suite, decoded_ack.node_id == ack_body.node_id);
    ASSERT_EQ(suite, ack_body.acked_seq, decoded_ack.acked_seq);
    ASSERT_EQ(suite, static_cast<int>(ack_body.accepted_state),
              static_cast<int>(decoded_ack.accepted_state));

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestInvalidFdThrows()
{
    INIT_SUITE(suite, "MasterProxy Invalid Fd");
    BEGIN_SUITE(suite);

    MasterProxy proxy(0);
    bool threw = false;

    try
    {
        proxy.GetTask(-1);
    }
    catch (const std::invalid_argument&)
    {
        threw = true;
    }

    ASSERT_TRUE(suite, threw);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

} // namespace

int main()
{
    PRINT_TEST_HEADER("MasterProxy");

    TestReadRequestParsing();
    TestWriteRequestParsing();
    TestHeartbeatRequestParsing();
    TestDropResponseDatagram();
    TestDropMalformedDatagram();
    TestSendReadResponse();
    TestSendWriteResponse();
    TestSendFlushResponse();
    TestSendHeartbeatResponse();
    TestInvalidFdThrows();

    PRINT_SUMMARY();

    return 0;
}
