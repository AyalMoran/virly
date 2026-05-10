/**
 * @file MinionResponseProxy.hpp
 * @brief Declares the framework input proxy that consumes minion responses.
 */
#ifndef ILRD_CONCRETE_MINION_RESPONSE_PROXY_HPP
#define ILRD_CONCRETE_MINION_RESPONSE_PROXY_HPP

#include <cstdint>
#include <string>
#include <utility>
#include <vector>

#include <netinet/in.h>

#include "Framework.hpp"
#include "response/ResponseManager.hpp"
#include "wire/WireProtocol.hpp"

namespace ilrd::concrete
{

/**
 * @brief Receives UDP responses from one or more minion endpoints and feeds them into ResponseManager.
 */
class MinionResponseProxy : public IInputProxy
{
  public:
    /**
     * @brief Simple endpoint descriptor used by the multi-endpoint constructor.
     */
    using Endpoint = std::pair<std::string, std::uint16_t>;

    MinionResponseProxy(int socket_fd,
                        const std::string& minion_ip,
                        std::uint16_t minion_port,
                        ResponseManager& response_manager);
    MinionResponseProxy(int socket_fd,
                        const std::vector<Endpoint>& endpoints,
                        ResponseManager& response_manager);

    /**
     * @brief Receives and handles one datagram worth of minion response traffic.
     * @param fd Ready descriptor supplied by the framework.
     * @return Always returns `nullptr`; responses are handled internally.
     */
    ITask* GetTask(int fd) override;

  private:
    bool ReceiveDatagram(int fd,
                         std::vector<std::uint8_t>& bytes,
                         sockaddr_storage& source_address,
                         socklen_t& source_address_len) const;
    bool IsExpectedEndpoint(const sockaddr_storage& address,
                            socklen_t address_len) const;
    bool DecodeResponse(const std::vector<std::uint8_t>& bytes,
                        wire::MessageV1& response) const;

    int m_socketFd;
    std::vector<sockaddr_in> m_minionAddresses;
    ResponseManager& m_responseManager;
};

} // namespace ilrd::concrete

#endif // ILRD_CONCRETE_MINION_RESPONSE_PROXY_HPP
