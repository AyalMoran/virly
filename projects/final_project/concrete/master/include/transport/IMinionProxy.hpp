/**
 * @file IMinionProxy.hpp
 * @brief Declares the transport abstraction used to talk to minion nodes.
 */
#ifndef ILRD_CONCRETE_I_MINION_PROXY_HPP
#define ILRD_CONCRETE_I_MINION_PROXY_HPP

#include <chrono>
#include <cstdint>
#include <vector>

#include "identity/UUID.hpp"
#include "wire/WireProtocol.hpp"

namespace ilrd::concrete
{

/**
 * @brief Transport interface for sending requests to and receiving responses from minions.
 */
class IMinionProxy
{
  public:
    virtual ~IMinionProxy() = default;

    virtual UUID SendReadRequest(std::uint64_t offset,
                                 std::uint32_t length,
                                 const UUID& request_id) = 0;
    virtual UUID SendWriteRequest(std::uint64_t offset,
                                  const std::vector<std::uint8_t>& payload,
                                  const UUID& request_id) = 0;
    virtual UUID SendFlushRequest(const UUID& request_id) = 0;
    virtual UUID SendHeartbeatRequest(const UUID& node_id,
                                      std::uint64_t heartbeat_seq,
                                      wire::HealthState health_state,
                                      const UUID& request_id) = 0;

    /**
     * @brief Attempts to receive a wire response within the supplied timeout.
     * @param out Receives the decoded response on success.
     * @param timeout Maximum time to wait.
     * @return `true` when a response was received and decoded.
     */
    virtual bool ReceiveResponse(wire::MessageV1& out,
                                 std::chrono::milliseconds timeout) = 0;
};

} // namespace ilrd::concrete

#endif // ILRD_CONCRETE_I_MINION_PROXY_HPP
