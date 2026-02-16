#include "Net/UdpSocket.hpp"
#include "Net/Logger.hpp"

#include <arpa/inet.h>
#include <cerrno>
#include <cstring>
#include <sstream>
#include <stdexcept>
#include <sys/socket.h>
#include <sys/types.h>
#include <unistd.h>


UdpSocket::UdpSocket() : SocketBase(socket(AF_INET, SOCK_DGRAM, 0))
{
    if (GetFd() < 0)
    {
        throw std::runtime_error(
            Logger::BuildErrnoMessage("socket(AF_INET, SOCK_DGRAM) failed"));
    }
}

UdpSocket::UdpSocket(int fd) : SocketBase(fd)
{
}

void UdpSocket::Bind(const Endpoint& endpoint) const
{
    struct sockaddr_in addr = endpoint.ToSockAddrIn();
    if (bind(GetFd(), reinterpret_cast<const struct sockaddr*>(&addr),
             sizeof(addr)) < 0)
    {
        throw std::runtime_error(Logger::BuildErrnoMessage("bind() failed"));
    }
}

void UdpSocket::Connect(const Endpoint& endpoint) const
{
    struct sockaddr_in addr = endpoint.ToSockAddrIn();
    if (connect(GetFd(), reinterpret_cast<const struct sockaddr*>(&addr),
                sizeof(addr)) < 0)
    {
        throw std::runtime_error(Logger::BuildErrnoMessage("connect() failed"));
    }
}

void UdpSocket::EnableReuseAddress() const
{
    int enabled = 1;
    if (setsockopt(GetFd(), SOL_SOCKET, SO_REUSEADDR, &enabled,
                   sizeof(enabled)) < 0)
    {
        throw std::runtime_error(
            Logger::BuildErrnoMessage("setsockopt(SO_REUSEADDR) failed"));
    }
}

void UdpSocket::EnableBroadcast() const
{
    int enabled = 1;
    if (setsockopt(GetFd(), SOL_SOCKET, SO_BROADCAST, &enabled,
                   sizeof(enabled)) < 0)
    {
        throw std::runtime_error(
            Logger::BuildErrnoMessage("setsockopt(SO_BROADCAST) failed"));
    }
}

int UdpSocket::SendTo(const Endpoint& endpoint,
                      const std::string& message) const
{
    struct sockaddr_in addr = endpoint.ToSockAddrIn();
    int sent =
        sendto(GetFd(), message.c_str(), message.size(), 0,
               reinterpret_cast<const struct sockaddr*>(&addr), sizeof(addr));
    if (sent < 0)
    {
        throw std::runtime_error(Logger::BuildErrnoMessage("sendto() failed"));
    }
    return sent;
}

int UdpSocket::Send(const std::string& message) const
{
    int sent = send(GetFd(), message.c_str(), message.size(), 0);
    if (sent < 0)
    {
        throw std::runtime_error(Logger::BuildErrnoMessage("send() failed"));
    }
    return sent;
}

int UdpSocket::ReceiveFrom(std::string& outMessage, Endpoint& outSender) const
{
    char buffer[4096];
    struct sockaddr_in senderAddr;
    socklen_t senderSize = sizeof(senderAddr);

    int received =
        recvfrom(GetFd(), buffer, sizeof(buffer) - 1, 0,
                 reinterpret_cast<struct sockaddr*>(&senderAddr), &senderSize);
    if (received < 0)
    {
        throw std::runtime_error(Logger::BuildErrnoMessage("recvfrom() failed"));
    }

    buffer[received] = '\0';
    outMessage.assign(buffer, received);

    char ipText[INET_ADDRSTRLEN];
    if (inet_ntop(AF_INET, &senderAddr.sin_addr, ipText, sizeof(ipText)) ==
        NULL)
    {
        outSender.SetHost("unknown");
    }
    else
    {
        outSender.SetHost(ipText);
    }
    outSender.SetPort(ntohs(senderAddr.sin_port));

    return received;
}

int UdpSocket::Receive(std::string& outMessage) const
{
    char buffer[4096];
    int received = recv(GetFd(), buffer, sizeof(buffer) - 1, 0);
    if (received < 0)
    {
        throw std::runtime_error(Logger::BuildErrnoMessage("recv() failed"));
    }

    buffer[received] = '\0';
    outMessage.assign(buffer, received);
    return received;
}
