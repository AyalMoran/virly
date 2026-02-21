#ifndef NET_TCP_SOCKET_HPP
#define NET_TCP_SOCKET_HPP

#include "Net/Endpoint.hpp"
#include "Net/SocketBase.hpp"
#include <string>

class TcpSocket : public SocketBase
{
  public:
    TcpSocket();
    explicit TcpSocket(int fd);

    void EnableReuseAddress() const;
    void Bind(const Endpoint& endpoint) const;
    void Connect(const Endpoint& endpoint) const;
    void Listen(int backlog) const;

    int Accept(Endpoint& outPeer) const;

    void SendLine(const std::string& message) const;
    bool ReceiveLine(std::string& outLine) const;

    Endpoint GetPeer() const;
  private:
    void SendAll(const std::string& data) const;
};

#endif
