#include "Net/Endpoint.hpp"

#include <arpa/inet.h>
#include <cstring>
#include <netdb.h>
#include <stdexcept>

Endpoint::Endpoint() : m_host("0.0.0.0"), m_port(0)
{
}

Endpoint::Endpoint(const std::string& host, unsigned short port)
    : m_host(host), m_port(port)
{
}

void Endpoint::SetHost(const std::string& host)
{
    m_host = host;
}

void Endpoint::SetPort(unsigned short port)
{
    m_port = port;
}

const std::string& Endpoint::GetHost() const
{
    return m_host;
}

unsigned short Endpoint::GetPort() const
{
    return m_port;
}

struct sockaddr_in Endpoint::ToSockAddrIn() const
{
    struct sockaddr_in addr;
    std::memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(m_port);

    if (m_host.empty())
    {
        addr.sin_addr.s_addr = htonl(INADDR_ANY);
        return addr;
    }

    int parseResult = inet_pton(AF_INET, m_host.c_str(), &addr.sin_addr);
    if (parseResult == 1)
    {
        return addr;
    }

    struct hostent* hostEntry = gethostbyname(m_host.c_str());
    if (hostEntry == NULL || hostEntry->h_addr_list == NULL ||
        hostEntry->h_addr_list[0] == NULL)
    {
        throw std::runtime_error("Failed to resolve host: " + m_host);
    }

    std::memcpy(&addr.sin_addr, hostEntry->h_addr_list[0], hostEntry->h_length);
    return addr;
}
