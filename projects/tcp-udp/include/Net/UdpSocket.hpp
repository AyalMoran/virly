#ifndef NET_UDP_SOCKET_HPP
#define NET_UDP_SOCKET_HPP

#include "Net/Endpoint.hpp"
#include "Net/SocketBase.hpp"
#include <string>

class UdpSocket : public SocketBase
{
  public:
    UdpSocket();
    explicit UdpSocket(int fd);
    
    void Bind(const Endpoint& endpoint) const;
    void Connect(const Endpoint& endpoint) const;
    void EnableReuseAddress() const;
    void EnableBroadcast() const;

    int SendTo(const Endpoint& endpoint, const std::string& message) const;
    int Send(const std::string& message) const;

    int ReceiveFrom(std::string& outMessage, Endpoint& outSender) const;
    int Receive(std::string& outMessage) const;
};

#endif
