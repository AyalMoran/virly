#ifndef NET_ENDPOINT_HPP
#define NET_ENDPOINT_HPP

#include <netinet/in.h>
#include <string>

class Endpoint
{
  public:
    Endpoint();
    Endpoint(const std::string& host, unsigned short port);

    void SetHost(const std::string& host);
    void SetPort(unsigned short port);

    const std::string& GetHost() const;
    unsigned short GetPort() const;

    struct sockaddr_in ToSockAddrIn() const;

  private:
    std::string m_host;
    unsigned short m_port;
};

#endif
