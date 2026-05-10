#include "transport/MinionResponseProxy.hpp"

#include <cerrno>
#include <stdexcept>
#include <string>
#include <system_error>

#include <arpa/inet.h>
#include <sys/socket.h>

#include "Logger.hpp"
#include "DebugLogger.hpp"
#include "serialization/Serializer.hpp"

namespace ilrd::concrete
{

namespace
{

const std::size_t kMaxDatagramBytes =
    static_cast<std::size_t>(wire::kHeaderSize) +
    static_cast<std::size_t>(wire::kMaxPayloadBytes);

void LogDroppedResponse(const std::string& message)
{
    Logger::Instance().Log("MinionResponseProxy dropped response: " + message,
                           Logger::Level::WARNING);
}

} // namespace

MinionResponseProxy::MinionResponseProxy(
    int socket_fd,
    const std::string& minion_ip,
    std::uint16_t minion_port,
    ResponseManager& response_manager)
    : MinionResponseProxy(socket_fd,
                          std::vector<MinionResponseProxy::Endpoint>(
                              1, MinionResponseProxy::Endpoint(minion_ip,
                                                               minion_port)),
                          response_manager)
{
}

MinionResponseProxy::MinionResponseProxy(
    int socket_fd,
    const std::vector<MinionResponseProxy::Endpoint>& endpoints,
    ResponseManager& response_manager)
    : m_socketFd(socket_fd),
      m_minionAddresses(),
      m_responseManager(response_manager)
{
    if (socket_fd < 0)
    {
        throw std::invalid_argument(
            "MinionResponseProxy socket fd must be non-negative");
    }

    if (endpoints.empty())
    {
        throw std::invalid_argument(
            "MinionResponseProxy requires at least one endpoint");
    }

    for (const MinionResponseProxy::Endpoint& endpoint : endpoints)
    {
        if (0 == endpoint.second)
        {
            throw std::invalid_argument(
                "MinionResponseProxy minion port must be nonzero");
        }

        sockaddr_in address = {};
        address.sin_family = AF_INET;
        address.sin_port = htons(endpoint.second);
        if (1 != inet_pton(AF_INET, endpoint.first.c_str(), &address.sin_addr))
        {
            throw std::invalid_argument(
                "MinionResponseProxy minion IP must be valid IPv4");
        }

        m_minionAddresses.push_back(address);
    }

    ILRD_DEBUG_LOG("MinionResponseProxy initialized for endpoints=" +
                   std::to_string(m_minionAddresses.size()));
}

ITask* MinionResponseProxy::GetTask(int fd)
{
    if (fd != m_socketFd)
    {
        throw std::invalid_argument("MinionResponseProxy received unexpected fd");
    }

    try
    {
        ILRD_DEBUG_LOG("MinionResponseProxy polling fd=" + std::to_string(fd));
        std::vector<std::uint8_t> datagram;
        sockaddr_storage source_address = {};
        socklen_t source_address_len = 0;

        if (!ReceiveDatagram(fd, datagram, source_address, source_address_len))
        {
            return nullptr;
        }

        if (!IsExpectedEndpoint(source_address, source_address_len))
        {
            LogDroppedResponse("unexpected endpoint");
            return nullptr;
        }

        wire::MessageV1 response;
        if (!DecodeResponse(datagram, response))
        {
            return nullptr;
        }

        m_responseManager.HandleResponse(response);
        ILRD_DEBUG_LOG("MinionResponseProxy forwarded response request_id=" +
                       response.header.request_id.ToString());
    }
    catch (const std::system_error& error)
    {
        Logger::Instance().Log(
            std::string("MinionResponseProxy I/O error: ") + error.what(),
            Logger::Level::ERROR);
    }
    catch (const std::exception& error)
    {
        LogDroppedResponse(error.what());
    }

    return nullptr;
}

bool MinionResponseProxy::ReceiveDatagram(
    int fd,
    std::vector<std::uint8_t>& bytes,
    sockaddr_storage& source_address,
    socklen_t& source_address_len) const
{
    bytes.assign(kMaxDatagramBytes, 0);
    source_address_len = sizeof(source_address);

    const ssize_t bytes_read =
        recvfrom(fd, bytes.data(), bytes.size(), 0,
                 reinterpret_cast<sockaddr*>(&source_address),
                 &source_address_len);
    if (bytes_read < 0)
    {
        throw std::system_error(errno, std::generic_category(),
                                "MinionResponseProxy recvfrom failed");
    }

    if (0 == bytes_read)
    {
        bytes.clear();
        return false;
    }

    bytes.resize(static_cast<std::size_t>(bytes_read));
    return true;
}

bool MinionResponseProxy::IsExpectedEndpoint(const sockaddr_storage& address,
                                             socklen_t address_len) const
{
    if (address_len < sizeof(sockaddr_in) || AF_INET != address.ss_family)
    {
        return false;
    }

    const sockaddr_in* source =
        reinterpret_cast<const sockaddr_in*>(&address);

    for (const sockaddr_in& expected : m_minionAddresses)
    {
        if (source->sin_port == expected.sin_port &&
            source->sin_addr.s_addr == expected.sin_addr.s_addr)
        {
            return true;
        }
    }

    return false;
}

bool MinionResponseProxy::DecodeResponse(const std::vector<std::uint8_t>& bytes,
                                         wire::MessageV1& response) const
{
    try
    {
        Buffer buffer = wire::MakeBuffer(bytes);
        wire::MessageV1 message;
        message.Deserialize(buffer);

        if (!wire::IsResponseType(message.header.message_type))
        {
            LogDroppedResponse("datagram is not a response");
            return false;
        }

        response = message;
        ILRD_DEBUG_LOG("MinionResponseProxy decoded response request_id=" +
                       response.header.request_id.ToString());
        return true;
    }
    catch (const std::exception& error)
    {
        LogDroppedResponse(error.what());
        return false;
    }
}

} // namespace ilrd::concrete
