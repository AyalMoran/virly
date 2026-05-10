#include <array>
#include <cerrno>
#include <cstring>
#include <stdexcept>
#include <vector>

#include <arpa/inet.h>
#include <linux/nbd.h>
#include <sys/socket.h>
#include <unistd.h>

#include "nbd/NBDCommunicator.hpp"
#include "test_utils.hpp"

namespace
{

using ilrd::concrete::NBDCommunicator;

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
    for (std::size_t i = 0; i < sizeof(request.handle); ++i)
    {
        request.handle[i] = static_cast<char>('A' + i);
    }
    return request;
}

void TestReadRequestDecode()
{
    INIT_SUITE(suite, "NBDCommunicator Read Decode");
    BEGIN_SUITE(suite);

    SocketPair pair;
    NBDCommunicator communicator(pair.First());
    nbd_request raw = MakeRawRequest(NBD_CMD_READ, 4096, 512);
    WriteAll(pair.Second(), &raw, sizeof(raw));

    NBDCommunicator::Request request;
    ASSERT_TRUE(suite, communicator.ReceiveRequest(request));
    ASSERT_EQ(suite, static_cast<int>(NBDCommunicator::RequestType::READ),
              static_cast<int>(request.type));
    ASSERT_EQ(suite, 4096ULL, request.offset);
    ASSERT_EQ(suite, 512u, request.length);
    ASSERT_EQ(suite, 0u, request.payload.size());
    ASSERT_EQ(suite, 'A', request.handle[0]);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestWriteRequestDecode()
{
    INIT_SUITE(suite, "NBDCommunicator Write Decode");
    BEGIN_SUITE(suite);

    SocketPair pair;
    NBDCommunicator communicator(pair.First());
    const std::vector<std::uint8_t> payload = {0x10, 0x20, 0x30};
    nbd_request raw = MakeRawRequest(NBD_CMD_WRITE, 128, payload.size());
    WriteAll(pair.Second(), &raw, sizeof(raw));
    WriteAll(pair.Second(), payload.data(), payload.size());

    NBDCommunicator::Request request;
    ASSERT_TRUE(suite, communicator.ReceiveRequest(request));
    ASSERT_EQ(suite, static_cast<int>(NBDCommunicator::RequestType::WRITE),
              static_cast<int>(request.type));
    ASSERT_EQ(suite, 128ULL, request.offset);
    ASSERT_EQ(suite, payload.size(), request.payload.size());
    ASSERT_EQ(suite, 0x10, request.payload[0]);
    ASSERT_EQ(suite, 0x30, request.payload[2]);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestFlushRequestDecode()
{
    INIT_SUITE(suite, "NBDCommunicator Flush Decode");
    BEGIN_SUITE(suite);

    SocketPair pair;
    NBDCommunicator communicator(pair.First());
    nbd_request raw = MakeRawRequest(NBD_CMD_FLUSH, 0, 0);
    WriteAll(pair.Second(), &raw, sizeof(raw));

    NBDCommunicator::Request request;
    ASSERT_TRUE(suite, communicator.ReceiveRequest(request));
    ASSERT_EQ(suite, static_cast<int>(NBDCommunicator::RequestType::FLUSH),
              static_cast<int>(request.type));

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestSendReply()
{
    INIT_SUITE(suite, "NBDCommunicator Send Reply");
    BEGIN_SUITE(suite);

    SocketPair pair;
    NBDCommunicator communicator(pair.First());
    NBDCommunicator::Request request;
    request.type = NBDCommunicator::RequestType::READ;
    request.length = 2;
    request.handle[0] = 'x';
    request.handle[1] = 'y';

    const std::vector<std::uint8_t> payload = {'o', 'k'};
    communicator.SendReply(request, 0, payload);

    nbd_reply reply = {};
    ReadAll(pair.Second(), &reply, sizeof(reply));
    std::array<std::uint8_t, 2> read_payload = {};
    ReadAll(pair.Second(), read_payload.data(), read_payload.size());

    ASSERT_EQ(suite, NBD_REPLY_MAGIC, ntohl(reply.magic));
    ASSERT_EQ(suite, 0u, ntohl(reply.error));
    ASSERT_EQ(suite, 'x', reply.handle[0]);
    ASSERT_EQ(suite, 'y', reply.handle[1]);
    ASSERT_EQ(suite, 'o', read_payload[0]);
    ASSERT_EQ(suite, 'k', read_payload[1]);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestSendErrorReply()
{
    INIT_SUITE(suite, "NBDCommunicator Send Error Reply");
    BEGIN_SUITE(suite);

    SocketPair pair;
    NBDCommunicator communicator(pair.First());
    NBDCommunicator::Request request;
    request.type = NBDCommunicator::RequestType::WRITE;
    request.handle[0] = 'e';

    communicator.SendReply(request, EIO, std::vector<std::uint8_t>{'x'});

    nbd_reply reply = {};
    ReadAll(pair.Second(), &reply, sizeof(reply));

    ASSERT_EQ(suite, NBD_REPLY_MAGIC, ntohl(reply.magic));
    ASSERT_EQ(suite, static_cast<std::uint32_t>(EIO), ntohl(reply.error));
    ASSERT_EQ(suite, 'e', reply.handle[0]);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

} // namespace

int main()
{
    PRINT_TEST_HEADER("NBDCommunicator");

    TestReadRequestDecode();
    TestWriteRequestDecode();
    TestFlushRequestDecode();
    TestSendReply();
    TestSendErrorReply();

    PRINT_SUMMARY();
    return 0;
}
