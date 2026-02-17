#include "Net/TcpSocket.hpp"
#include "Net/Logger.hpp"

#include "TcpSocket.hpp"
#include <arpa/inet.h>
#include <cerrno>
#include <cstring>
#include <sstream>
#include <stdexcept>
#include <sys/socket.h>
#include <sys/types.h>
#include <unistd.h>

TcpSocket::TcpSocket() : SocketBase(socket(AF_INET, SOCK_STREAM, 0))
{
    if (GetFd() < 0)
    {
        throw std::runtime_error(
            Logger::BuildErrnoMessage("socket(AF_INET, SOCK_STREAM) failed"));
    }
}

TcpSocket::TcpSocket(int fd) : SocketBase(fd)
{
}

void TcpSocket::EnableReuseAddress() const
{
    int enabled = 1;
    if (setsockopt(GetFd(), SOL_SOCKET, SO_REUSEADDR, &enabled,
                   sizeof(enabled)) < 0)
    {
        throw std::runtime_error(
            Logger::BuildErrnoMessage("setsockopt(SO_REUSEADDR) failed"));
    }
}

void TcpSocket::Bind(const Endpoint& endpoint) const
{
    struct sockaddr_in addr = endpoint.ToSockAddrIn();
    if (bind(GetFd(), reinterpret_cast<const struct sockaddr*>(&addr),
             sizeof(addr)) < 0)
    {
        throw std::runtime_error(Logger::BuildErrnoMessage("bind() failed"));
    }
}

void TcpSocket::Connect(const Endpoint& endpoint) const
{
    struct sockaddr_in addr = endpoint.ToSockAddrIn();
    if (connect(GetFd(), reinterpret_cast<const struct sockaddr*>(&addr),
                sizeof(addr)) < 0)
    {
        throw std::runtime_error(Logger::BuildErrnoMessage("connect() failed"));
    }
}

void TcpSocket::Listen(int backlog) const
{
    if (listen(GetFd(), backlog) < 0)
    {
        throw std::runtime_error(Logger::BuildErrnoMessage("listen() failed"));
    }
}

int TcpSocket::Accept(Endpoint& outPeer) const
{
    struct sockaddr_in peerAddr;
    socklen_t peerSize = sizeof(peerAddr);
    int clientFd = accept(
        GetFd(), reinterpret_cast<struct sockaddr*>(&peerAddr), &peerSize);
    if (clientFd < 0)
    {
        throw std::runtime_error(Logger::BuildErrnoMessage("accept() failed"));
    }

    char ipText[INET_ADDRSTRLEN];
    if (inet_ntop(AF_INET, &peerAddr.sin_addr, ipText, sizeof(ipText)) == NULL)
    {
        outPeer.SetHost("unknown");
    }
    else
    {
        outPeer.SetHost(ipText);
    }
    outPeer.SetPort(ntohs(peerAddr.sin_port));

    return clientFd;
}

void TcpSocket::SendLine(const std::string& message) const
{
    std::string line = message;
    line += "\n";
    SendAll(line);
}

void TcpSocket::SendAll(const std::string& data) const
{
    std::size_t offset = 0;
    while (offset < data.size())
    {
        int sent =
            send(GetFd(), data.c_str() + offset, data.size() - offset, 0);
        if (sent < 0)
        {
            if (errno == EINTR)
            {
                continue;
            }
            throw std::runtime_error(
                Logger::BuildErrnoMessage("send() failed"));
        }
        offset += static_cast<std::size_t>(sent);
    }
}

bool TcpSocket::ReceiveLine(std::string& outLine) const
{
    outLine.clear();
    while (true)
    {
        char c = '\0';
        int received = recv(GetFd(), &c, 1, 0);
        if (received == 0)
        {
            return !outLine.empty();
        }
        if (received < 0)
        {
            if (errno == EINTR)
            {
                continue;
            }
            throw std::runtime_error(
                Logger::BuildErrnoMessage("recv() failed"));
        }

        if (c == '\n')
        {
            return true;
        }

        outLine.push_back(c);
    }
}

Endpoint TcpSocket::GetPeer() const
{
    struct sockaddr_in peerAddr;
    socklen_t peerSize = sizeof(peerAddr);

    if (getpeername(GetFd(), reinterpret_cast<struct sockaddr*>(&peerAddr),
                    &peerSize) < 0)
    {
        throw std::runtime_error(
            Logger::BuildErrnoMessage("getpeername() failed"));
    }

    char ipText[INET_ADDRSTRLEN];
    
    if (inet_ntop(AF_INET, &(peerAddr.sin_addr), ipText, sizeof(ipText)) ==
        NULL)
    {
        throw std::runtime_error(
            Logger::BuildErrnoMessage("inet_ntop() failed"));
    }
    
    Endpoint peerEndpoint(ipText, ntohs(peerAddr.sin_port));
    
    return peerEndpoint;
}
