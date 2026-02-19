#include "Server.hpp"          // Server 
#include "Endpoint.hpp"        // Endpoint 
#include "Logger.hpp"          // Logger 
#include "MessageBuilder.hpp"  // MessageBuilder 
#include "SignalManager.hpp"   // SignalManager 
#include "TcpSocket.hpp"       // TcpSocket 

#include <cstddef>             // std::size_t
#include <sstream>             // std::stringstream
#include <string>              // std::string

#include <cerrno>              // errno
#include <cctype>              // std::isspace
#include <cstdio>              // std::fprintf
#include <fcntl.h>             // fcntl
#include <sys/epoll.h>         // epoll_create1
#include <sys/socket.h>        // getsockopt
#include <sys/stat.h>          // fstat
#include <sys/types.h>         // socklen_t
#include <unistd.h>            // read

#include <stdexcept>           // std::runtime_error

enum FileType
{
    REGULAR_FILE,
    DIRECTORY,
    CHARACTER_DEVICE,
    BLOCK_DEVICE,
    FIFO,
    SYMBOLIC_LINK,
    SOCKET,
    UNKNOWN
};

static FileType CheckFileType(int fd);
static int GetSocketType(const int fd);
static std::string ReadFromStreamSocket(TcpSocket* clientSocket);
static void SetNonBlocking(int fd);
static bool IsPingCommand(const std::string& command);
static bool IsQuitCommand(const std::string& command);
static std::string NormalizeCommand(const std::string& command);

Server::Server()
    : m_pendingUdpPeer(),
      m_pendingUdpReply(""),
      m_hasPendingUdpReply(false),
      m_stdinBuffer(""),
      m_stopRequested(false),
      m_events(10),
      m_epollFd(epoll_create1(0)),
      m_timeout(7)
{
    if (m_epollFd < 0)
    {
        throw std::runtime_error(
            Logger::BuildErrnoMessage("epoll_create1() failed"));
    }

    Endpoint endpoint("0.0.0.0", 8080);
    m_TcpListener.EnableReuseAddress();
    m_TcpListener.Bind(endpoint);
    m_TcpListener.Listen(10);
    Add(m_TcpListener.GetFd(), EPOLLIN);

    Endpoint udpEndpoint("0.0.0.0", 8081);
    m_UdpListener.EnableReuseAddress();
    m_UdpListener.Bind(udpEndpoint);
    Add(m_UdpListener.GetFd(), EPOLLIN);
    Add(STDIN_FILENO, EPOLLIN);
    SetNonBlocking(STDOUT_FILENO);

    LOG_INFO(
        "Server initialized and listening on ports 8080 (TCP) and 8081 (UDP)");

    m_tcpClients.clear();
}

Server::Server(int epollFd, int timeout)
    : m_pendingUdpPeer(),
      m_pendingUdpReply(""),
      m_hasPendingUdpReply(false),
      m_stdinBuffer(""),
      m_stopRequested(false),
      m_events(10),
      m_epollFd(epollFd),
      m_timeout(timeout)
{
    if (m_epollFd < 0)
    {
        throw std::runtime_error(
            Logger::BuildErrnoMessage("epoll_create1() failed"));
    }

    Endpoint tcpEndpoint("0.0.0.0", 8080);
    m_TcpListener.EnableReuseAddress();
    m_TcpListener.Bind(tcpEndpoint);
    m_TcpListener.Listen(10);
    Add(m_TcpListener.GetFd(), EPOLLIN);
    SetNonBlocking(m_TcpListener.GetFd());

    Endpoint udpEndpoint("0.0.0.0", 8081);
    m_UdpListener.EnableReuseAddress();
    m_UdpListener.Bind(udpEndpoint);
    Add(m_UdpListener.GetFd(), EPOLLIN);
    SetNonBlocking(m_UdpListener.GetFd());

    Add(STDIN_FILENO, EPOLLIN);
    SetNonBlocking(STDOUT_FILENO);

    LOG_INFO(
        "Server initialized and listening on ports 8080 (TCP) and 8081 (UDP)");

    m_tcpClients.clear();
}

Server::~Server()
{
    for (std::map<int, TcpSocket*>::iterator it = m_tcpClients.begin();
         it != m_tcpClients.end(); ++it)
    {
        delete it->second;
    }

    m_tcpClients.clear();
    
}

Server& Server::SetFd(int fd)
{
    m_epollFd = fd;
    return *this;
}

int Server::GetFd()
{
    return m_epollFd;
}

int Server::Add(int fd, uint32_t events) const
{
    SetNonBlocking(fd);

    struct epoll_event ev;
    ev.events = events;
    ev.data.fd = fd;
    if (epoll_ctl(m_epollFd, EPOLL_CTL_ADD, fd, &ev) < 0)
    {
        throw std::runtime_error(
            Logger::BuildErrnoMessage("epoll_ctl(EPOLL_CTL_ADD) failed"));
    }
    return 0;
}

int Server::Remove(int fd, uint32_t events) const
{
    (void)events;
    if (epoll_ctl(m_epollFd, EPOLL_CTL_DEL, fd, NULL) < 0)
    {
        throw std::runtime_error(
            Logger::BuildErrnoMessage("epoll_ctl(EPOLL_CTL_DEL) failed"));
    }
    return 0;
}

int Server::Modify(int fd, uint32_t events) const
{
    struct epoll_event ev;
    ev.events = events;
    ev.data.fd = fd;
    if (epoll_ctl(m_epollFd, EPOLL_CTL_MOD, fd, &ev) < 0)
    {
        throw std::runtime_error(
            Logger::BuildErrnoMessage("epoll_ctl(EPOLL_CTL_MOD) failed"));
    }
    return 0;
}

int Server::Wait(epoll_event* events, int maxEvents, int timeout) const
{
    return epoll_pwait(m_epollFd, events, maxEvents, timeout, NULL);
}

void Server::Run()
{
    SignalManager::InstallHandlers();

    int status = 0;
    while (0 <= (status = Wait(m_events.data(), m_events.size(),
                               m_timeout * 1000)) &&
           SignalManager::IsStopRequested() == false && !m_stopRequested)
    {
        try
        {
            if (status == 0)
            {
                std::stringstream ss;

                ss << m_timeout;
                std::string timeoutStr =
                    "Server::Run() - Nothing Happened for " + ss.str();
                timeoutStr += " seconds";
                Logger::Info(timeoutStr);
                continue;
            }

            for (int i = 0; i < status; ++i)
            {
                if (m_events[i].events & EPOLLIN)
                {
                    if (m_events[i].data.fd == m_TcpListener.GetFd())
                    {
                        LOG_INFO("Accepting new connection");
                        Register(m_TcpListener.GetFd());
                        continue;
                    }
                    HandleReadEvent(m_events[i].data.fd);
                }
                else if (m_events[i].events & EPOLLOUT)
                {
                    HandleWriteEvent(m_events[i].data.fd);
                }
            }
        }
        catch (const std::exception& ex)
        {
            if (SignalManager::IsStopRequested() || errno == EINTR)
            {
                break;
            }
            LOG_ERROR(std::string("Error in event loop: ") + ex.what());
        }
    }

    LOG_INFO("PingPong Server is stopping");

}

int Server::Register(int fd)
{
    (void)fd;
    int new_fd = accept(m_TcpListener.GetFd(), NULL, NULL);
    if (new_fd < 0)
    {
        if (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR)
        {
            return 0;
        }
        throw std::runtime_error(Logger::BuildErrnoMessage("accept() failed"));
    }

    m_tcpClients[new_fd] = new TcpSocket(new_fd);
    return Add(new_fd, EPOLLIN);
}

void Server::HandleReadEvent(int fd)
{
    if (fd == STDIN_FILENO)
    {
        HandleStdinInput();
        return;
    }

    switch (CheckFileType(fd))
    {
    case SOCKET:
        LOG_INFO("Handling read event for socket");
        try
        {
            std::string line = ReadFromSocket(fd);
            if (line.empty() && m_tcpClients.find(fd) != m_tcpClients.end())
            {
                std::ostringstream stopLog;
                stopLog << "Closing TCP client fd=" << fd;
                LOG_INFO(stopLog.str());

                TcpSocket* client = m_tcpClients[fd];
                m_tcpClients.erase(fd);
                Remove(fd, 0);
                delete client;
                return;
            }

            if (IsPingCommand(line))
            {
                if (fd == m_UdpListener.GetFd())
                {
                    std::stringstream ss;
                    ss << "Received " << line << " from UDP client "
                       << m_pendingUdpPeer.GetHost() << ":"
                       << m_pendingUdpPeer.GetPort();
                    LOG_INFO(ss.str());
                }
                else
                {
                    if (m_tcpClients.find(fd) == m_tcpClients.end())
                    {
                        LOG_ERROR("Received ping from unknown TCP client");
                        return;
                    }
                    std::stringstream ss;
                    ss << "Received " << line << " from client "
                       << m_tcpClients[fd]->GetPeer().GetHost() << ":"
                       << m_tcpClients[fd]->GetPeer().GetPort();
                    LOG_INFO(ss.str());
                }
                Modify(fd, EPOLLOUT);
            }
        }
        catch (const std::exception& ex)
        {
            LOG_ERROR(ex.what());
        }
        break;
    default:
        LOG_ERROR("Unknown file type");
    }
}

void Server::WriteToSocket(int fd)
{
    int socket_type = GetSocketType(fd);

    if (-1 == socket_type)
    {
        throw std::runtime_error(
            Logger::BuildErrnoMessage("Failed To Get Socket Type"));
    }

    if (socket_type == SOCK_STREAM)
    {
        LOG_INFO("Writing to stream socket");
        if (m_tcpClients.find(fd) == m_tcpClients.end())
        {
            LOG_ERROR("Received write event for unknown TCP client");
            return;
        }
        m_tcpClients[fd]->SendLine("Pong");
    }
    else if (socket_type == SOCK_DGRAM)
    {
        LOG_INFO("Writing to datagram socket");
        if (fd != m_UdpListener.GetFd())
        {
            LOG_ERROR("Received write event for unknown UDP socket");
            return;
        }
        if (!m_hasPendingUdpReply)
        {
            LOG_ERROR("Received write event for UDP socket without pending reply");
            return;
        }
        m_UdpListener.SendTo(m_pendingUdpPeer, m_pendingUdpReply);
        m_hasPendingUdpReply = false;
        m_pendingUdpReply.clear();
    }
    else
    {
        LOG_ERROR("Unknown socket type");
        return;
    }
}
void Server::HandleWriteEvent(int fd)
{
    switch (CheckFileType(fd))
    {
    case SOCKET:
        LOG_INFO("Handling read event for socket");
        try
        {
            WriteToSocket(fd);
            Modify(fd, EPOLLIN);
        }
        catch (const std::exception& ex)
        {
            LOG_ERROR(ex.what());
        }
        break;
    default:
        LOG_ERROR("Unknown file type");
    }
}

void Server::HandleErrorEvent(int fd)
{
}

static FileType CheckFileType(int fd)
{
    struct stat buf;
    if (fstat(fd, &buf) == -1)
    {
        Logger::Error("fstat error");
        return UNKNOWN;
    }

    if (S_ISREG(buf.st_mode))
    {
        return REGULAR_FILE;
    }
    else if (S_ISDIR(buf.st_mode))
    {
        return DIRECTORY;
    }
    else if (S_ISCHR(buf.st_mode))
    {
        return CHARACTER_DEVICE;
    }
    else if (S_ISBLK(buf.st_mode))
    {
        return BLOCK_DEVICE;
    }
    else if (S_ISFIFO(buf.st_mode))
    {
        return FIFO;
    }
    else if (S_ISLNK(buf.st_mode))
    {
        return SYMBOLIC_LINK;
    }
    else if (S_ISSOCK(buf.st_mode))
    {
        return SOCKET;
    }
    else
    {
        return UNKNOWN;
    }
}

static int GetSocketType(const int fd)
{
    int type = -1;
    socklen_t typelen = sizeof(type);

    if (-1 == fd)
    {
        errno = EBADF;
        throw std::runtime_error(
            Logger::BuildErrnoMessage("Invalid file descriptor"));
    }

    if (-1 == getsockopt(fd, SOL_SOCKET, SO_TYPE, &type, &typelen))
    {
        throw std::runtime_error(
            Logger::BuildErrnoMessage("Invalid file descriptor"));
    }

    errno = 0;
    return type;
}

std::string Server::ReadFromSocket(int fd)
{
    int socket_type = GetSocketType(fd);

    if (-1 == socket_type)
    {
        throw std::runtime_error(
            Logger::BuildErrnoMessage("Failed To Get Socket Type"));
    }

    if (socket_type == SOCK_STREAM)
    {
        LOG_INFO("Reading from stream socket");
        if (m_tcpClients.find(fd) == m_tcpClients.end())
        {
            LOG_ERROR("Received read event for unknown TCP client");
            return "";
        }
        return ReadFromStreamSocket(m_tcpClients[fd]);
    }
    else if (socket_type == SOCK_DGRAM)
    {
        LOG_INFO("Reading from datagram socket");
        if (fd != m_UdpListener.GetFd())
        {
            LOG_ERROR("Received read event for unknown UDP socket");
            return "";
        }

        Endpoint sender;
        std::string message;
        m_UdpListener.ReceiveFrom(message, sender);

        m_pendingUdpPeer = sender;
        m_pendingUdpReply = "pong";
        m_hasPendingUdpReply = true;

        return message;
    }
    else
    {
        LOG_ERROR("Unknown socket type");
        return "";
    }
}

void Server::HandleStdinInput()
{
    char buffer[256];

    while (true)
    {
        const ssize_t bytesRead = read(STDIN_FILENO, buffer, sizeof(buffer));
        if (bytesRead < 0)
        {
            if (errno == EAGAIN || errno == EWOULDBLOCK)
            {
                break;
            }
            throw std::runtime_error(
                Logger::BuildErrnoMessage("read(STDIN_FILENO) failed"));
        }

        if (bytesRead == 0)
        {
            break;
        }

        m_stdinBuffer.append(buffer, static_cast<size_t>(bytesRead));
    }

    std::string::size_type newlinePos = std::string::npos;
    while ((newlinePos = m_stdinBuffer.find('\n')) != std::string::npos)
    {
        std::string command = m_stdinBuffer.substr(0, newlinePos);
        m_stdinBuffer.erase(0, newlinePos + 1);

        if (!command.empty() && command[command.size() - 1] == '\r')
        {
            command.erase(command.size() - 1);
        }

        if (IsPingCommand(command))
        {
            const char pongMessage[] = "pong\n";
            if (write(STDOUT_FILENO, pongMessage, sizeof(pongMessage) - 1) < 0 &&
                errno != EAGAIN && errno != EWOULDBLOCK)
            {
                throw std::runtime_error(
                    Logger::BuildErrnoMessage("write(STDOUT_FILENO) failed"));
            }
            continue;
        }

        if (IsQuitCommand(command))
        {
            m_stopRequested = true;
            LOG_INFO("Quit command received from stdin");
            break;
        }
    }
}

int Server::Stop()
{
    m_stopRequested = true;
    return 0;
}

static std::string ReadFromStreamSocket(TcpSocket* clientSocket)
{
    std::string line;
    try
    {
        if (!clientSocket->ReceiveLine(line))
        {
            std::ostringstream stopLog;
            stopLog << "TCP client disconnected "
                    << clientSocket->GetPeer().GetHost() << ":"
                    << clientSocket->GetPeer().GetPort();
            LOG_INFO(stopLog.str());

            clientSocket->Close();
            return "";
        }
    }
    catch (const std::exception& ex)
    {
        LOG_ERROR(ex.what());
        return "";
    }

    return line;
}

static void SetNonBlocking(int fd)
{
    int flags = fcntl(fd, F_GETFL, 0);
    if (flags < 0)
    {
        throw std::runtime_error(
            Logger::BuildErrnoMessage("fcntl(F_GETFL) failed"));
    }

    if ((flags & O_NONBLOCK) != 0)
    {
        return;
    }

    if (fcntl(fd, F_SETFL, flags | O_NONBLOCK) < 0)
    {
        throw std::runtime_error(
            Logger::BuildErrnoMessage("fcntl(F_SETFL, O_NONBLOCK) failed"));
    }
}

static bool IsPingCommand(const std::string& command)
{
    const std::string normalized = NormalizeCommand(command);
    return normalized == "Ping" || normalized == "ping";
}

static bool IsQuitCommand(const std::string& command)
{
    const std::string normalized = NormalizeCommand(command);
    return normalized == "Quit" || normalized == "quit";
}

static std::string NormalizeCommand(const std::string& command)
{
    std::string normalized = command;

    while (!normalized.empty() &&
           std::isspace(static_cast<unsigned char>(normalized[0])))
    {
        normalized.erase(0, 1);
    }

    while (!normalized.empty() &&
           std::isspace(
               static_cast<unsigned char>(normalized[normalized.size() - 1])))
    {
        normalized.erase(normalized.size() - 1, 1);
    }

    return normalized;
}
