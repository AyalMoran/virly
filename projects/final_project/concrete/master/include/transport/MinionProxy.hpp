/**
 * @file MinionProxy.hpp
 * @brief Declares the UDP-based transport used by the master to contact a minion.
 */
#ifndef ILRD_CONCRETE_MINION_PROXY_HPP
#define ILRD_CONCRETE_MINION_PROXY_HPP

#include <chrono>
#include <cstdint>
#include <string>
#include <vector>

#include <netinet/in.h>

#include "transport/IMinionProxy.hpp"

namespace ilrd::concrete
{

/**
 * @brief Sends protocol requests to one minion endpoint and receives its replies.
 */
class MinionProxy : public IMinionProxy
{
  public:
    MinionProxy(int socket_fd,
                const std::string& minion_ip,
                std::uint16_t minion_port);

    UUID SendReadRequest(std::uint64_t offset,
                         std::uint32_t length,
                         const UUID& request_id) override;
    UUID SendWriteRequest(std::uint64_t offset,
                          const std::vector<std::uint8_t>& payload,
                          const UUID& request_id) override;
    UUID SendFlushRequest(const UUID& request_id) override;
    UUID SendHeartbeatRequest(const UUID& node_id,
                              std::uint64_t heartbeat_seq,
                              wire::HealthState health_state,
                              const UUID& request_id) override;

    bool ReceiveResponse(wire::MessageV1& out,
                         std::chrono::milliseconds timeout) override;

  private:
    void SendMessage(const wire::MessageV1& message);
    bool ReceiveDatagram(std::vector<std::uint8_t>& bytes,
                         sockaddr_storage& source_address,
                         socklen_t& source_address_len,
                         std::chrono::milliseconds timeout) const;
    bool IsExpectedEndpoint(const sockaddr_storage& address,
                            socklen_t address_len) const;

    int m_socketFd;
    sockaddr_in m_minionAddress;
};

} // namespace ilrd::concrete

#endif // ILRD_CONCRETE_MINION_PROXY_HPP
