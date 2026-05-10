#include "transport/MasterProxy.hpp"

#include <cerrno>
#include <cstring>
#include <stdexcept>
#include <string>
#include <system_error>
#include <vector>

#include <sys/socket.h>
#include <unistd.h>

#include "Logger.hpp"
#include "DebugLogger.hpp"

namespace ilrd::concrete
{

namespace
{

const std::size_t kMaxDatagramBytes =
    static_cast<std::size_t>(wire::kHeaderSize) +
    static_cast<std::size_t>(wire::kMaxPayloadBytes);

std::vector<std::uint8_t> ReceiveDatagram(
    int fd, sockaddr_storage& source_address, socklen_t& source_address_len)
{
    std::vector<std::uint8_t> buffer(kMaxDatagramBytes, 0);
    iovec io = {};
    io.iov_base = buffer.data();
    io.iov_len = buffer.size();

    msghdr message = {};
    message.msg_name = &source_address;
    message.msg_namelen = sizeof(source_address);
    message.msg_iov = &io;
    message.msg_iovlen = 1;

    const ssize_t bytes_read = recvmsg(fd, &message, 0);
    if (bytes_read < 0)
    {
        throw std::system_error(errno, std::generic_category(),
                                "MasterProxy recvmsg failed");
    }

    if (0 == bytes_read)
    {
        source_address_len = 0;
        return std::vector<std::uint8_t>();
    }

    if (0 != (message.msg_flags & MSG_TRUNC))
    {
        Logger::Instance().Log("MasterProxy dropped oversized datagram",
                               Logger::Level::WARNING);
        source_address_len = 0;
        return std::vector<std::uint8_t>();
    }

    source_address_len = message.msg_namelen;
    buffer.resize(static_cast<std::size_t>(bytes_read));
    return buffer;
}

wire::MessageV1 DecodeMessage(const std::vector<std::uint8_t>& bytes)
{
    if (bytes.size() < wire::kHeaderSize)
    {
        throw std::runtime_error("datagram shorter than wire header");
    }

    Buffer header_buffer = wire::MakeBuffer(bytes);
    wire::MessageHeaderV1 header;
    header.Deserialize(header_buffer);

    const std::size_t expected_size =
        static_cast<std::size_t>(wire::kHeaderSize) +
        static_cast<std::size_t>(header.payload_length);
    if (bytes.size() != expected_size)
    {
        throw std::runtime_error("datagram size does not match header payload");
    }

    Buffer message_buffer = wire::MakeBuffer(bytes);
    wire::MessageV1 message;
    message.Deserialize(message_buffer);
    return message;
}

void CopyEndpoint(sockaddr_storage& dest, socklen_t& dest_len,
                  const sockaddr_storage& src, socklen_t src_len)
{
    std::memset(&dest, 0, sizeof(dest));
    std::memcpy(&dest, &src, src_len);
    dest_len = src_len;
}

std::uint16_t ResponseFlags(wire::StatusCode status, bool has_payload)
{
    std::uint16_t flags = static_cast<std::uint16_t>(wire::FLAG_RESPONSE);
    if (has_payload)
    {
        flags = static_cast<std::uint16_t>(
            flags | static_cast<std::uint16_t>(wire::FLAG_HAS_PAYLOAD));
    }

    if (wire::StatusCode::DEGRADED_OK == status)
    {
        flags = static_cast<std::uint16_t>(
            flags | static_cast<std::uint16_t>(wire::FLAG_DEGRADED));
    }

    return flags;
}

} // namespace

MasterProxy::MasterProxy(int send_fd)
    : m_sendFd(send_fd), m_masterAddress(), m_masterAddressLen(0),
      m_hasMasterAddress(false)
{
    if (send_fd < 0)
    {
        throw std::invalid_argument("MasterProxy send fd must be non-negative");
    }
}

ITask* MasterProxy::GetTask(int fd)
{
    if (fd < 0)
    {
        throw std::invalid_argument("MasterProxy::GetTask() invalid fd");
    }

    try
    {
        sockaddr_storage source_address = {};
        socklen_t source_address_len = 0;
        const std::vector<std::uint8_t> datagram =
            ReceiveDatagram(fd, source_address, source_address_len);

        if (datagram.empty())
        {
            ILRD_DEBUG_LOG("MasterProxy received empty datagram");
            return nullptr;
        }

        wire::MessageV1 message = DecodeMessage(datagram);
        ITask* task = BuildTaskFromWireMessage(message);
        ILRD_DEBUG_LOG("MasterProxy decoded request request_id=" +
                       message.header.request_id.ToString() + " type=" +
                       std::to_string(static_cast<int>(message.header.message_type)));
        CopyEndpoint(m_masterAddress, m_masterAddressLen, source_address,
                     source_address_len);
        m_hasMasterAddress = true;
        ILRD_DEBUG_LOG("MasterProxy cached master endpoint");
        return task;
    }
    catch (const std::system_error& error)
    {
        Logger::Instance().Log(
            std::string("MasterProxy I/O error: ") + error.what(),
            Logger::Level::ERROR);
    }
    catch (const std::exception& error)
    {
        Logger::Instance().Log(
            std::string("MasterProxy dropped invalid datagram: ") + error.what(),
            Logger::Level::WARNING);
    }

    return nullptr;
}

void MasterProxy::SendReadResponse(const ReadTask& request,
                                   wire::StatusCode status,
                                   const std::vector<std::uint8_t>& payload)
{
    ILRD_DEBUG_LOG("MasterProxy sending READ_RESP request_id=" +
                   request.GetRequestId().ToString() + " status=" +
                   std::to_string(static_cast<int>(status)) + " payload_bytes=" +
                   std::to_string(payload.size()));
    SendMessage(BuildReadResponse(request, status, payload));
}

void MasterProxy::SendWriteResponse(const WriteTask& request,
                                    wire::StatusCode status)
{
    ILRD_DEBUG_LOG("MasterProxy sending WRITE_RESP request_id=" +
                   request.GetRequestId().ToString() + " status=" +
                   std::to_string(static_cast<int>(status)));
    SendMessage(BuildWriteResponse(request, status));
}

void MasterProxy::SendFlushResponse(const FlushTask& request,
                                    wire::StatusCode status)
{
    ILRD_DEBUG_LOG("MasterProxy sending FLUSH_RESP request_id=" +
                   request.GetRequestId().ToString() + " status=" +
                   std::to_string(static_cast<int>(status)));
    SendMessage(BuildFlushResponse(request, status));
}

void MasterProxy::SendHeartbeatResponse(const HeartbeatTask& request,
                                        wire::StatusCode status,
                                        const wire::HeartbeatAckBodyV1& body)
{
    ILRD_DEBUG_LOG("MasterProxy sending HEARTBEAT_RESP request_id=" +
                   request.GetRequestId().ToString() + " status=" +
                   std::to_string(static_cast<int>(status)));
    SendMessage(BuildHeartbeatResponse(request, status, body));
}

wire::MessageV1 MasterProxy::BuildReadResponse(
    const ReadTask& request, wire::StatusCode status,
    const std::vector<std::uint8_t>& payload) const
{
    if ((wire::StatusCode::OK == status ||
         wire::StatusCode::DEGRADED_OK == status) &&
        payload.size() != request.GetOperationLength())
    {
        throw std::invalid_argument(
            "Successful read response payload must match request length");
    }

    if (wire::StatusCode::OK != status &&
        wire::StatusCode::DEGRADED_OK != status && !payload.empty())
    {
        throw std::invalid_argument(
            "Error read response must not carry payload");
    }

    wire::MessageV1 message;
    message.header.message_type = wire::MessageType::READ_RESP;
    message.header.flags =
        ResponseFlags(status, !payload.empty());
    message.header.status_code = status;
    message.header.request_id = request.GetRequestId();
    message.header.logical_offset = request.GetLogicalOffset();
    message.header.operation_length = request.GetOperationLength();
    message.header.payload_length =
        static_cast<std::uint32_t>(payload.size());
    message.payload = payload;
    return message;
}

wire::MessageV1 MasterProxy::BuildWriteResponse(
    const WriteTask& request, wire::StatusCode status) const
{
    wire::MessageV1 message;
    message.header.message_type = wire::MessageType::WRITE_RESP;
    message.header.flags = ResponseFlags(status, false);
    message.header.status_code = status;
    message.header.request_id = request.GetRequestId();
    message.header.logical_offset = request.GetLogicalOffset();
    message.header.operation_length = request.GetOperationLength();
    message.header.payload_length = 0;
    return message;
}

wire::MessageV1 MasterProxy::BuildFlushResponse(
    const FlushTask& request, wire::StatusCode status) const
{
    wire::MessageV1 message;
    message.header.message_type = wire::MessageType::FLUSH_RESP;
    message.header.flags = ResponseFlags(status, false);
    message.header.status_code = status;
    message.header.request_id = request.GetRequestId();
    message.header.logical_offset = request.GetLogicalOffset();
    message.header.operation_length = request.GetOperationLength();
    message.header.payload_length = 0;
    return message;
}

wire::MessageV1 MasterProxy::BuildHeartbeatResponse(
    const HeartbeatTask& request,
    wire::StatusCode status,
    const wire::HeartbeatAckBodyV1& body) const
{
    if (wire::StatusCode::OK != status &&
        wire::StatusCode::DEGRADED_OK != status)
    {
        throw std::invalid_argument(
            "Heartbeat response currently supports only success statuses");
    }

    Buffer payload_buffer;
    body.Serialize(payload_buffer);

    wire::MessageV1 message;
    message.header.message_type = wire::MessageType::HEARTBEAT_RESP;
    message.header.flags = ResponseFlags(status, true);
    message.header.status_code = status;
    message.header.request_id = request.GetRequestId();
    message.header.logical_offset = request.GetLogicalOffset();
    message.header.operation_length = request.GetOperationLength();
    message.header.payload_length =
        static_cast<std::uint32_t>(payload_buffer.GetSize());
    message.payload.assign(payload_buffer.GetData(),
                           payload_buffer.GetData() + payload_buffer.GetSize());
    return message;
}

void MasterProxy::SendMessage(const wire::MessageV1& message)
{
    EnsureDestinationAvailable();

    Buffer buffer;
    message.Serialize(buffer);
    ILRD_DEBUG_LOG("MasterProxy serializing datagram bytes=" +
                   std::to_string(buffer.GetSize()));

    const ssize_t bytes_sent =
        sendto(m_sendFd, buffer.GetData(), buffer.GetSize(), 0,
               reinterpret_cast<const sockaddr*>(&m_masterAddress),
               m_masterAddressLen);
    if (bytes_sent != static_cast<ssize_t>(buffer.GetSize()))
    {
        throw std::system_error(errno, std::generic_category(),
                                "MasterProxy sendto failed");
    }
}

void MasterProxy::EnsureDestinationAvailable() const
{
    if (!m_hasMasterAddress)
    {
        throw std::logic_error("MasterProxy has no cached master endpoint");
    }
}

} // namespace ilrd::concrete
