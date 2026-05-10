#include <cerrno>
#include <memory>
#include <stdexcept>
#include <vector>

#include <arpa/inet.h>
#include <linux/nbd.h>
#include <sys/socket.h>
#include <unistd.h>

#include "nbd/NBDCommunicator.hpp"
#include "nbd/NBDProxy.hpp"
#include "tasks/ConcreteTasks.hpp"
#include "test_utils.hpp"

namespace
{

using ilrd::ITask;
using ilrd::UUID;
using ilrd::concrete::FlushTask;
using ilrd::concrete::NBDCommunicator;
using ilrd::concrete::NBDProxy;
using ilrd::concrete::ReadTask;
using ilrd::concrete::ResponseManager;
using ilrd::concrete::WriteTask;
using ilrd::wire::MessageType;
using ilrd::wire::MessageV1;
using ilrd::wire::StatusCode;

class SocketPair
{
  public:
    SocketPair() : m_fds{-1, -1}
    {
        if (0 != socketpair(AF_UNIX, SOCK_STREAM, 0, m_fds))
        {
            throw std::runtime_error("socketpair failed");
        }
    }

    ~SocketPair()
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

    int First() const
    {
        return m_fds[0];
    }

    int Second() const
    {
        return m_fds[1];
    }

  private:
    int m_fds[2];
};

void WriteAll(int fd, const void* data, std::size_t size)
{
    const char* bytes = static_cast<const char*>(data);
    std::size_t written = 0;
    while (written < size)
    {
        const ssize_t rc = write(fd, bytes + written, size - written);
        if (rc <= 0)
        {
            throw std::runtime_error("write failed");
        }
        written += static_cast<std::size_t>(rc);
    }
}

void ReadAll(int fd, void* data, std::size_t size)
{
    char* bytes = static_cast<char*>(data);
    std::size_t read_count = 0;
    while (read_count < size)
    {
        const ssize_t rc = read(fd, bytes + read_count, size - read_count);
        if (rc <= 0)
        {
            throw std::runtime_error("read failed");
        }
        read_count += static_cast<std::size_t>(rc);
    }
}

nbd_request MakeRawRequest(std::uint32_t type,
                           std::uint64_t offset,
                           std::uint32_t length)
{
    nbd_request request = {};
    request.magic = htonl(NBD_REQUEST_MAGIC);
    request.type = htonl(type);
    request.from = NBDCommunicator::HostToNetwork64(offset);
    request.len = htonl(length);
    request.handle[0] = 'h';
    request.handle[1] = '1';
    return request;
}

ResponseManager::ResponseCompletion MakeCompletion(
    const UUID& request_id,
    MessageType response_type,
    StatusCode status = StatusCode::OK,
    const std::vector<std::uint8_t>& payload = std::vector<std::uint8_t>())
{
    ResponseManager::ResponseCompletion completion;
    completion.request_id = request_id;
    completion.state = (StatusCode::OK == status ||
                        StatusCode::DEGRADED_OK == status)
                           ? ResponseManager::State::COMPLETED
                           : ResponseManager::State::FAILED;
    completion.status = status;
    completion.response_type = response_type;
    completion.payload = payload;
    completion.response.header.message_type = response_type;
    completion.response.header.status_code = status;
    completion.response.header.request_id = request_id;
    completion.response.payload = payload;
    return completion;
}

nbd_reply ReadReply(int fd)
{
    nbd_reply reply = {};
    ReadAll(fd, &reply, sizeof(reply));
    return reply;
}

void TestReadTaskAndResponse()
{
    INIT_SUITE(suite, "NBDProxy Read Task And Response");
    BEGIN_SUITE(suite);

    SocketPair pair;
    NBDCommunicator communicator(pair.First());
    NBDProxy proxy(communicator);

    nbd_request raw = MakeRawRequest(NBD_CMD_READ, 512, 4);
    WriteAll(pair.Second(), &raw, sizeof(raw));

    std::unique_ptr<ITask> task(proxy.GetTask(pair.First()));
    ReadTask* read_task = dynamic_cast<ReadTask*>(task.get());
    ASSERT_NOT_NULL(suite, read_task);
    ASSERT_EQ(suite, 512ULL, read_task->GetLogicalOffset());
    ASSERT_EQ(suite, 4u, read_task->GetOperationLength());

    const std::vector<std::uint8_t> payload = {'d', 'a', 't', 'a'};
    proxy.SendResponse(MakeCompletion(read_task->GetRequestId(),
                                      MessageType::READ_RESP,
                                      StatusCode::OK,
                                      payload));

    nbd_reply reply = ReadReply(pair.Second());
    std::vector<std::uint8_t> returned_payload(4, 0);
    ReadAll(pair.Second(), returned_payload.data(), returned_payload.size());

    ASSERT_EQ(suite, NBD_REPLY_MAGIC, ntohl(reply.magic));
    ASSERT_EQ(suite, 0u, ntohl(reply.error));
    ASSERT_EQ(suite, 'h', reply.handle[0]);
    ASSERT_EQ(suite, payload.size(), returned_payload.size());
    ASSERT_EQ(suite, 'd', returned_payload[0]);
    ASSERT_EQ(suite, 'a', returned_payload[3]);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestWriteTaskAndResponse()
{
    INIT_SUITE(suite, "NBDProxy Write Task And Response");
    BEGIN_SUITE(suite);

    SocketPair pair;
    NBDCommunicator communicator(pair.First());
    NBDProxy proxy(communicator);
    const std::vector<std::uint8_t> payload = {0xCA, 0xFE};

    nbd_request raw = MakeRawRequest(NBD_CMD_WRITE, 128, payload.size());
    WriteAll(pair.Second(), &raw, sizeof(raw));
    WriteAll(pair.Second(), payload.data(), payload.size());

    std::unique_ptr<ITask> task(proxy.GetTask(pair.First()));
    WriteTask* write_task = dynamic_cast<WriteTask*>(task.get());
    ASSERT_NOT_NULL(suite, write_task);
    ASSERT_EQ(suite, 128ULL, write_task->GetLogicalOffset());
    ASSERT_EQ(suite, payload.size(), write_task->GetData().size());
    ASSERT_EQ(suite, 0xCA, write_task->GetData()[0]);

    proxy.SendResponse(MakeCompletion(write_task->GetRequestId(),
                                      MessageType::WRITE_RESP));
    nbd_reply reply = ReadReply(pair.Second());

    ASSERT_EQ(suite, NBD_REPLY_MAGIC, ntohl(reply.magic));
    ASSERT_EQ(suite, 0u, ntohl(reply.error));
    ASSERT_EQ(suite, 'h', reply.handle[0]);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestFlushTaskAndResponse()
{
    INIT_SUITE(suite, "NBDProxy Flush Task And Response");
    BEGIN_SUITE(suite);

    SocketPair pair;
    NBDCommunicator communicator(pair.First());
    NBDProxy proxy(communicator);

    nbd_request raw = MakeRawRequest(NBD_CMD_FLUSH, 0, 0);
    WriteAll(pair.Second(), &raw, sizeof(raw));

    std::unique_ptr<ITask> task(proxy.GetTask(pair.First()));
    FlushTask* flush_task = dynamic_cast<FlushTask*>(task.get());
    ASSERT_NOT_NULL(suite, flush_task);

    proxy.SendResponse(MakeCompletion(flush_task->GetRequestId(),
                                      MessageType::FLUSH_RESP));
    nbd_reply reply = ReadReply(pair.Second());

    ASSERT_EQ(suite, NBD_REPLY_MAGIC, ntohl(reply.magic));
    ASSERT_EQ(suite, 0u, ntohl(reply.error));

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestFailedCompletionSendsError()
{
    INIT_SUITE(suite, "NBDProxy Failed Completion Sends Error");
    BEGIN_SUITE(suite);

    SocketPair pair;
    NBDCommunicator communicator(pair.First());
    NBDProxy proxy(communicator);

    nbd_request raw = MakeRawRequest(NBD_CMD_WRITE, 128, 1);
    const std::uint8_t byte = 0x01;
    WriteAll(pair.Second(), &raw, sizeof(raw));
    WriteAll(pair.Second(), &byte, sizeof(byte));

    std::unique_ptr<ITask> task(proxy.GetTask(pair.First()));
    WriteTask* write_task = dynamic_cast<WriteTask*>(task.get());
    ASSERT_NOT_NULL(suite, write_task);

    proxy.SendResponse(MakeCompletion(write_task->GetRequestId(),
                                      MessageType::WRITE_RESP,
                                      StatusCode::UNAVAILABLE));
    nbd_reply reply = ReadReply(pair.Second());

    ASSERT_EQ(suite, NBD_REPLY_MAGIC, ntohl(reply.magic));
    ASSERT_EQ(suite, static_cast<std::uint32_t>(ENODEV), ntohl(reply.error));

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestUnsupportedRequestGetsImmediateError()
{
    INIT_SUITE(suite, "NBDProxy Unsupported Request");
    BEGIN_SUITE(suite);

    SocketPair pair;
    NBDCommunicator communicator(pair.First());
    NBDProxy proxy(communicator);

    nbd_request raw = MakeRawRequest(NBD_CMD_TRIM, 0, 0);
    WriteAll(pair.Second(), &raw, sizeof(raw));

    std::unique_ptr<ITask> task(proxy.GetTask(pair.First()));
    nbd_reply reply = ReadReply(pair.Second());

    ASSERT_NULL(suite, task.get());
    ASSERT_EQ(suite, NBD_REPLY_MAGIC, ntohl(reply.magic));
    ASSERT_EQ(suite, static_cast<std::uint32_t>(EOPNOTSUPP), ntohl(reply.error));

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

} // namespace

int main()
{
    PRINT_TEST_HEADER("NBDProxy");

    TestReadTaskAndResponse();
    TestWriteTaskAndResponse();
    TestFlushTaskAndResponse();
    TestFailedCompletionSendsError();
    TestUnsupportedRequestGetsImmediateError();

    PRINT_SUMMARY();
    return 0;
}
