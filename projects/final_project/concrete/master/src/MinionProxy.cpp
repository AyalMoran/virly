#include "transport/MinionProxy.hpp"

#include <algorithm>
#include <cerrno>
#include <cstring>
#include <stdexcept>
#include <system_error>

#include <arpa/inet.h>
#include <poll.h>
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

int TimeoutToPollTimeout(std::chrono::milliseconds timeout)
{
    if (timeout < std::chrono::milliseconds::zero())
    {
        return -1;
    }

    const std::chrono::milliseconds max_int_ms(
        static_cast<int>(static_cast<unsigned int>(-1) >> 1));
    if (timeout > max_int_ms)
    {
        return static_cast<int>(max_int_ms.count());
    }

    return static_cast<int>(timeout.count());
}

std::uint16_t RequestFlags(bool has_payload)
{
    std::uint16_t flags = 0;
    if (has_payload)
    {
        flags = static_cast<std::uint16_t>(
            flags | static_cast<std::uint16_t>(wire::FLAG_HAS_PAYLOAD));
    }

    return flags;
}

wire::MessageV1 DecodeMessage(const std::vector<std::uint8_t>& bytes)
{
    Buffer buffer = wire::MakeBuffer(bytes);
    wire::MessageV1 message;
    message.Deserialize(buffer);
    return message;
}

void LogDroppedResponse(const std::string& message)
{
    Logger::Instance().Log("MinionProxy dropped response: " + message,
                           Logger::Level::WARNING);
}

} // namespace

MinionProxy::MinionProxy(int socket_fd,
                         const std::string& minion_ip,
                         std::uint16_t minion_port)
    : m_socketFd(socket_fd), m_minionAddress()
{
    if (socket_fd < 0)
    {
        throw std::invalid_argument("MinionProxy socket fd must be non-negative");
    }

    if (0 == minion_port)
    {
        throw std::invalid_argument("MinionProxy minion port must be nonzero");
    }

    m_minionAddress.sin_family = AF_INET;
    m_minionAddress.sin_port = htons(minion_port);
    if (1 != inet_pton(AF_INET, minion_ip.c_str(), &m_minionAddress.sin_addr))
    {
        throw std::invalid_argument("MinionProxy minion IP must be valid IPv4");
    }

    ILRD_DEBUG_LOG("MinionProxy initialized for remote port=" +
                   std::to_string(minion_port));
}

UUID MinionProxy::SendReadRequest(std::uint64_t offset,
                                  std::uint32_t length,
                                  const UUID& request_id)
{
    ILRD_DEBUG_LOG("MinionProxy sending READ_REQ request_id=" +
                   request_id.ToString() + " offset=" +
                   std::to_string(offset) + " length=" +
                   std::to_string(length));
    wire::MessageV1 message;
    message.header.message_type = wire::MessageType::READ_REQ;
    message.header.request_id = request_id;
    message.header.logical_offset = offset;
    message.header.operation_length = length;
    SendMessage(message);
    return request_id;
}

UUID MinionProxy::SendWriteRequest(std::uint64_t offset,
                                   const std::vector<std::uint8_t>& payload,
                                   const UUID& request_id)
{
    if (payload.empty())
    {
        throw std::invalid_argument("MinionProxy write payload must be nonempty");
    }

    if (payload.size() > static_cast<std::size_t>(wire::kMaxPayloadBytes))
    {
        throw std::invalid_argument("MinionProxy write payload exceeds wire maximum");
    }

    wire::MessageV1 message;
    message.header.message_type = wire::MessageType::WRITE_REQ;
    message.header.flags = RequestFlags(true);
    message.header.request_id = request_id;
    message.header.logical_offset = offset;
    message.header.operation_length = static_cast<std::uint32_t>(payload.size());
    message.header.payload_length = static_cast<std::uint32_t>(payload.size());
    message.payload = payload;
    ILRD_DEBUG_LOG("MinionProxy sending WRITE_REQ request_id=" +
                   request_id.ToString() + " offset=" +
                   std::to_string(offset) + " length=" +
                   std::to_string(payload.size()));
    SendMessage(message);
    return request_id;
}

UUID MinionProxy::SendFlushRequest(const UUID& request_id)
{
    ILRD_DEBUG_LOG("MinionProxy sending FLUSH_REQ request_id=" +
                   request_id.ToString());
    wire::MessageV1 message;
    message.header.message_type = wire::MessageType::FLUSH_REQ;
    message.header.request_id = request_id;
    SendMessage(message);
    return request_id;
}

UUID MinionProxy::SendHeartbeatRequest(const UUID& node_id,
                                       std::uint64_t heartbeat_seq,
                                       wire::HealthState health_state,
                                       const UUID& request_id)
{
    wire::HeartbeatBodyV1 body;
    body.node_id = node_id;
    body.heartbeat_seq = heartbeat_seq;
    body.health_state = health_state;

    Buffer payload_buffer;
    body.Serialize(payload_buffer);

    wire::MessageV1 message;
    message.header.message_type = wire::MessageType::HEARTBEAT_REQ;
    message.header.flags = RequestFlags(true);
    message.header.request_id = request_id;
    message.header.payload_length =
        static_cast<std::uint32_t>(payload_buffer.GetSize());
    message.payload.assign(payload_buffer.GetData(),
                           payload_buffer.GetData() + payload_buffer.GetSize());
    ILRD_DEBUG_LOG("MinionProxy sending HEARTBEAT_REQ request_id=" +
                   request_id.ToString() + " node_id=" + node_id.ToString());
    SendMessage(message);
    return request_id;
}

bool MinionProxy::ReceiveResponse(wire::MessageV1& out,
                                  std::chrono::milliseconds timeout)
{
    std::vector<std::uint8_t> bytes;
    sockaddr_storage source_address = {};
    socklen_t source_address_len = 0;

    if (!ReceiveDatagram(bytes, source_address, source_address_len, timeout))
    {
        ILRD_DEBUG_LOG("MinionProxy receive timed out or was interrupted");
        return false;
    }

    if (!IsExpectedEndpoint(source_address, source_address_len))
    {
        LogDroppedResponse("unexpected endpoint");
        return false;
    }

    try
    {
        wire::MessageV1 message = DecodeMessage(bytes);
        if (!wire::IsResponseType(message.header.message_type))
        {
            LogDroppedResponse("datagram is not a response");
            return false;
        }

        out = message;
        ILRD_DEBUG_LOG("MinionProxy received response request_id=" +
                       out.header.request_id.ToString() + " type=" +
                       std::to_string(static_cast<int>(out.header.message_type)));
        return true;
    }
    catch (const std::exception& error)
    {
        LogDroppedResponse(error.what());
        return false;
    }
}

void MinionProxy::SendMessage(const wire::MessageV1& message)
{
    Buffer buffer;
    message.Serialize(buffer);
    ILRD_DEBUG_LOG("MinionProxy serializing datagram bytes=" +
                   std::to_string(buffer.GetSize()));

    const ssize_t bytes_sent =
        sendto(m_socketFd, buffer.GetData(), buffer.GetSize(), 0,
               reinterpret_cast<const sockaddr*>(&m_minionAddress),
               sizeof(m_minionAddress));
    if (bytes_sent != static_cast<ssize_t>(buffer.GetSize()))
    {
        throw std::system_error(errno, std::generic_category(),
                                "MinionProxy sendto failed");
    }
}

bool MinionProxy::ReceiveDatagram(std::vector<std::uint8_t>& bytes,
                                  sockaddr_storage& source_address,
                                  socklen_t& source_address_len,
                                  std::chrono::milliseconds timeout) const
{
    pollfd pfd = {};
    pfd.fd = m_socketFd;
    pfd.events = POLLIN;

    const int poll_result =
        poll(&pfd, 1, TimeoutToPollTimeout(timeout));
    if (poll_result < 0)
    {
        if (EINTR == errno)
        {
            return false;
        }

        throw std::system_error(errno, std::generic_category(),
                                "MinionProxy poll failed");
    }

    if (0 == poll_result)
    {
        return false;
    }

    bytes.assign(kMaxDatagramBytes, 0);
    source_address_len = sizeof(source_address);

    const ssize_t bytes_read =
        recvfrom(m_socketFd, bytes.data(), bytes.size(), 0,
                 reinterpret_cast<sockaddr*>(&source_address),
                 &source_address_len);
    if (bytes_read < 0)
    {
        throw std::system_error(errno, std::generic_category(),
                                "MinionProxy recvfrom failed");
    }

    if (0 == bytes_read)
    {
        bytes.clear();
        return false;
    }

    bytes.resize(static_cast<std::size_t>(bytes_read));
    return true;
}

bool MinionProxy::IsExpectedEndpoint(const sockaddr_storage& address,
                                     socklen_t address_len) const
{
    if (address_len < sizeof(sockaddr_in) || AF_INET != address.ss_family)
    {
        return false;
    }

    const sockaddr_in* source =
        reinterpret_cast<const sockaddr_in*>(&address);

    return source->sin_port == m_minionAddress.sin_port &&
           source->sin_addr.s_addr == m_minionAddress.sin_addr.s_addr;
}

} // namespace ilrd::concrete
