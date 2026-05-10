#include "nbd/NBDCommunicator.hpp"

#include <cerrno>
#include <cstring>
#include <stdexcept>
#include <system_error>

#include <arpa/inet.h>
#include <fcntl.h>
#include <linux/nbd.h>
#include <signal.h>
#include <sys/ioctl.h>
#include <sys/socket.h>
#include <sys/wait.h>
#include <unistd.h>

namespace ilrd::concrete
{

namespace
{

constexpr std::uint32_t kCommandMask = 0x0000FFFFu;

void CloseIfOpen(int& fd)
{
    if (fd >= 0)
    {
        close(fd);
        fd = -1;
    }
}

} // namespace

NBDCommunicator::NBDCommunicator(int io_fd, bool owns_fd)
    : m_ioFd(io_fd), m_nbdFd(-1), m_childPid(-1), m_ownsIoFd(owns_fd)
{
    if (io_fd < 0)
    {
        throw std::invalid_argument("NBDCommunicator fd must be non-negative");
    }
}

NBDCommunicator::NBDCommunicator(int io_fd,
                                 int nbd_fd,
                                 pid_t child_pid,
                                 bool owns_io_fd)
    : m_ioFd(io_fd),
      m_nbdFd(nbd_fd),
      m_childPid(child_pid),
      m_ownsIoFd(owns_io_fd)
{
}

NBDCommunicator::~NBDCommunicator()
{
    try
    {
        Disconnect();
    }
    catch (...)
    {
    }
}

std::unique_ptr<NBDCommunicator> NBDCommunicator::Connect(const Options& options)
{
    if (options.device_path.empty())
    {
        throw std::invalid_argument("NBD device path must not be empty");
    }

    if (0 == options.size_bytes)
    {
        throw std::invalid_argument("NBD size must be nonzero");
    }

    int sockets[2] = {-1, -1};
    if (0 != socketpair(AF_UNIX, SOCK_STREAM, 0, sockets))
    {
        throw std::system_error(errno, std::generic_category(),
                                "NBD socketpair failed");
    }

    int nbd_fd = open(options.device_path.c_str(), O_RDWR);
    if (nbd_fd < 0)
    {
        CloseIfOpen(sockets[0]);
        CloseIfOpen(sockets[1]);
        throw std::system_error(errno, std::generic_category(),
                                "NBD open failed");
    }

    try
    {
        if (0 != ioctl(nbd_fd, NBD_SET_SIZE, options.size_bytes))
        {
            throw std::system_error(errno, std::generic_category(),
                                    "NBD_SET_SIZE failed");
        }

        if (0 != options.block_size &&
            0 != ioctl(nbd_fd, NBD_SET_BLKSIZE, options.block_size))
        {
            throw std::system_error(errno, std::generic_category(),
                                    "NBD_SET_BLKSIZE failed");
        }

        if (0 != ioctl(nbd_fd, NBD_CLEAR_SOCK))
        {
            throw std::system_error(errno, std::generic_category(),
                                    "NBD_CLEAR_SOCK failed");
        }

        const pid_t child = fork();
        if (child < 0)
        {
            throw std::system_error(errno, std::generic_category(),
                                    "NBD fork failed");
        }

        if (0 == child)
        {
            close(sockets[0]);
            RunKernelSide(nbd_fd, sockets[1], options);
            _exit(1);
        }

        close(sockets[1]);
        sockets[1] = -1;
        return std::unique_ptr<NBDCommunicator>(
            new NBDCommunicator(sockets[0], nbd_fd, child, true));
    }
    catch (...)
    {
        CloseIfOpen(sockets[0]);
        CloseIfOpen(sockets[1]);
        CloseIfOpen(nbd_fd);
        throw;
    }
}

int NBDCommunicator::GetFd() const
{
    return m_ioFd;
}

bool NBDCommunicator::ReceiveRequest(Request& out)
{
    nbd_request request = {};
    const ssize_t bytes_read = read(m_ioFd, &request, sizeof(request));
    if (0 == bytes_read)
    {
        return false;
    }

    if (bytes_read < 0)
    {
        throw std::system_error(errno, std::generic_category(),
                                "NBD request read failed");
    }

    if (bytes_read != static_cast<ssize_t>(sizeof(request)))
    {
        throw std::runtime_error("NBD short request header");
    }

    if (ntohl(request.magic) != NBD_REQUEST_MAGIC)
    {
        throw std::runtime_error("NBD request magic mismatch");
    }

    out = Request();
    out.raw_type = ntohl(request.type);
    out.type = ToRequestType(out.raw_type);
    out.offset = NetworkToHost64(request.from);
    out.length = ntohl(request.len);
    std::memcpy(out.handle.data(), request.handle, out.handle.size());

    if (RequestType::WRITE == out.type)
    {
        out.payload.resize(out.length);
        if (0 != out.length)
        {
            ReadAll(m_ioFd, out.payload.data(), out.payload.size());
        }
    }

    return true;
}

void NBDCommunicator::SendReply(
    const Request& request,
    int error_code,
    const std::vector<std::uint8_t>& payload)
{
    nbd_reply reply = {};
    reply.magic = htonl(NBD_REPLY_MAGIC);
    reply.error = htonl(static_cast<std::uint32_t>(error_code));
    std::memcpy(reply.handle, request.handle.data(), request.handle.size());

    WriteAll(m_ioFd, &reply, sizeof(reply));
    if (0 == error_code && !payload.empty())
    {
        WriteAll(m_ioFd, payload.data(), payload.size());
    }
}

void NBDCommunicator::Disconnect()
{
    if (m_nbdFd >= 0)
    {
        ioctl(m_nbdFd, NBD_DISCONNECT);
    }

    if (m_childPid > 0)
    {
        int status = 0;
        waitpid(m_childPid, &status, 0);
        m_childPid = -1;
    }

    if (m_nbdFd >= 0)
    {
        ioctl(m_nbdFd, NBD_CLEAR_QUE);
        ioctl(m_nbdFd, NBD_CLEAR_SOCK);
    }

    CloseIfOpen(m_nbdFd);
    if (m_ownsIoFd)
    {
        CloseIfOpen(m_ioFd);
    }
}

std::uint64_t NBDCommunicator::HostToNetwork64(std::uint64_t value)
{
    const std::uint32_t high = htonl(static_cast<std::uint32_t>(value >> 32U));
    const std::uint32_t low = htonl(static_cast<std::uint32_t>(value));
    return (static_cast<std::uint64_t>(low) << 32U) | high;
}

std::uint64_t NBDCommunicator::NetworkToHost64(std::uint64_t value)
{
    return HostToNetwork64(value);
}

void NBDCommunicator::ReadAll(int fd, void* buffer, std::size_t count)
{
    char* out = static_cast<char*>(buffer);
    std::size_t total = 0;
    while (total < count)
    {
        const ssize_t bytes_read = read(fd, out + total, count - total);
        if (bytes_read < 0)
        {
            if (EINTR == errno)
            {
                continue;
            }

            throw std::system_error(errno, std::generic_category(),
                                    "NBD read failed");
        }

        if (0 == bytes_read)
        {
            throw std::runtime_error("NBD unexpected EOF");
        }

        total += static_cast<std::size_t>(bytes_read);
    }
}

void NBDCommunicator::WriteAll(int fd, const void* buffer, std::size_t count)
{
    const char* in = static_cast<const char*>(buffer);
    std::size_t total = 0;
    while (total < count)
    {
        const ssize_t bytes_written = write(fd, in + total, count - total);
        if (bytes_written < 0)
        {
            if (EINTR == errno)
            {
                continue;
            }

            throw std::system_error(errno, std::generic_category(),
                                    "NBD write failed");
        }

        if (0 == bytes_written)
        {
            throw std::runtime_error("NBD short write");
        }

        total += static_cast<std::size_t>(bytes_written);
    }
}

NBDCommunicator::RequestType NBDCommunicator::ToRequestType(
    std::uint32_t raw_type)
{
    switch (raw_type & kCommandMask)
    {
    case NBD_CMD_READ:
        return RequestType::READ;
    case NBD_CMD_WRITE:
        return RequestType::WRITE;
    case NBD_CMD_FLUSH:
        return RequestType::FLUSH;
    case NBD_CMD_DISC:
        return RequestType::DISCONNECT;
    default:
        return RequestType::UNSUPPORTED;
    }
}

void NBDCommunicator::RunKernelSide(int nbd_fd,
                                    int kernel_socket,
                                    const Options& options)
{
    sigset_t sigset;
    sigfillset(&sigset);
    sigprocmask(SIG_SETMASK, &sigset, nullptr);

    ConfigureNBDDevice(nbd_fd, kernel_socket, options);
    ioctl(nbd_fd, NBD_DO_IT);
    ioctl(nbd_fd, NBD_CLEAR_QUE);
    ioctl(nbd_fd, NBD_CLEAR_SOCK);
}

void NBDCommunicator::ConfigureNBDDevice(int nbd_fd,
                                         int kernel_socket,
                                         const Options& options)
{
    (void)options;
    if (0 != ioctl(nbd_fd, NBD_SET_SOCK, kernel_socket))
    {
        _exit(2);
    }

#if defined(NBD_SET_FLAGS) && defined(NBD_FLAG_SEND_FLUSH)
    int flags = 0;
    if (options.enable_flush)
    {
        flags |= NBD_FLAG_SEND_FLUSH;
    }

    if (0 != flags && 0 != ioctl(nbd_fd, NBD_SET_FLAGS, flags))
    {
        _exit(3);
    }
#endif
}

} // namespace ilrd::concrete
