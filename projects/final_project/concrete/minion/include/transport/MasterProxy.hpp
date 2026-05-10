/**
 * @file MasterProxy.hpp
 * @brief Declares the minion-side transport proxy used to talk to the master.
 */
#ifndef ILRD_CONCRETE_MASTER_PROXY_HPP
#define ILRD_CONCRETE_MASTER_PROXY_HPP

#include <cstdint>
#include <vector>

#include <netinet/in.h>

#include "Framework.hpp"
#include "tasks/ConcreteTasks.hpp"
#include "wire/WireProtocol.hpp"

namespace ilrd::concrete
{

/**
 * @brief Receives master requests and sends protocol responses back to the master endpoint.
 */
class MasterProxy : public IInputProxy
{
  public:
    /**
     * @brief Binds the proxy to the socket used to talk to the master.
     * @param send_fd Datagram socket used for receive and reply traffic.
     */
    explicit MasterProxy(int send_fd);

    /**
     * @brief Receives and parses one master request into a framework task.
     * @param fd Ready descriptor supplied by the framework.
     * @return Newly allocated task owned by the caller.
     */
    ITask* GetTask(int fd) override;

    void SendReadResponse(const ReadTask& request,
                          wire::StatusCode status,
                          const std::vector<std::uint8_t>& payload =
                              std::vector<std::uint8_t>());
    void SendWriteResponse(const WriteTask& request, wire::StatusCode status);
    void SendFlushResponse(const FlushTask& request, wire::StatusCode status);
    void SendHeartbeatResponse(const HeartbeatTask& request,
                               wire::StatusCode status,
                               const wire::HeartbeatAckBodyV1& body);

  private:
    wire::MessageV1 BuildReadResponse(const ReadTask& request,
                                      wire::StatusCode status,
                                      const std::vector<std::uint8_t>& payload) const;
    wire::MessageV1 BuildWriteResponse(const WriteTask& request,
                                       wire::StatusCode status) const;
    wire::MessageV1 BuildFlushResponse(const FlushTask& request,
                                       wire::StatusCode status) const;
    wire::MessageV1 BuildHeartbeatResponse(
        const HeartbeatTask& request,
        wire::StatusCode status,
        const wire::HeartbeatAckBodyV1& body) const;
    void SendMessage(const wire::MessageV1& message);
    void EnsureDestinationAvailable() const;

    int m_sendFd;
    sockaddr_storage m_masterAddress;
    socklen_t m_masterAddressLen;
    bool m_hasMasterAddress;
};

} // namespace ilrd::concrete

#endif // ILRD_CONCRETE_MASTER_PROXY_HPP
