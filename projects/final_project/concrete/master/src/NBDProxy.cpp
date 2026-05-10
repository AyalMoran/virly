#include "nbd/NBDProxy.hpp"

#include <cerrno>
#include <stdexcept>
#include <string>
#include <utility>

#include "DebugLogger.hpp"
#include "Logger.hpp"
#include "tasks/ConcreteTasks.hpp"

namespace ilrd::concrete
{

namespace
{

wire::MessageHeaderV1 MakeHeader(wire::MessageType type,
                                 const UUID& request_id,
                                 std::uint64_t offset,
                                 std::uint32_t length,
                                 std::uint32_t payload_length)
{
    wire::MessageHeaderV1 header;
    header.message_type = type;
    header.request_id = request_id;
    header.logical_offset = offset;
    header.operation_length = length;
    header.payload_length = payload_length;
    if (payload_length != 0)
    {
        header.SetFlag(wire::FLAG_HAS_PAYLOAD);
    }

    return header;
}

} // namespace

NBDProxy::NBDProxy(NBDCommunicator& communicator)
    : m_communicator(communicator), m_mutex(), m_pending()
{
    ILRD_DEBUG_LOG("NBDProxy constructed");
}

ITask* NBDProxy::GetTask(int fd)
{
    (void)fd;

    NBDCommunicator::Request request;
    if (!m_communicator.ReceiveRequest(request))
    {
        ILRD_DEBUG_LOG("NBDProxy received no request from communicator");
        return nullptr;
    }

    ILRD_DEBUG_LOG("NBDProxy received request type=" +
                   std::to_string(static_cast<int>(request.type)) +
                   " offset=" + std::to_string(request.offset) +
                   " length=" + std::to_string(request.length));

    if (NBDCommunicator::RequestType::DISCONNECT == request.type)
    {
        ILRD_DEBUG_LOG_LEVEL("NBDProxy received disconnect request",
                             Logger::Level::WARNING);
        RequestFrameworkStop();
        return nullptr;
    }

    if (NBDCommunicator::RequestType::UNSUPPORTED == request.type)
    {
        ILRD_DEBUG_LOG_LEVEL("NBDProxy received unsupported request",
                             Logger::Level::WARNING);
        m_communicator.SendReply(request, EOPNOTSUPP);
        return nullptr;
    }

    try
    {
        const UUID request_id;
        const wire::MessageType expected_type = ExpectedResponseType(request.type);
        StorePending(request_id, request, expected_type);
        ILRD_DEBUG_LOG("NBDProxy built task for request_id=" +
                       request_id.ToString());
        return BuildTask(request, request_id);
    }
    catch (const std::exception& error)
    {
        Logger::Instance().Log(
            std::string("NBDProxy failed to build task: ") + error.what(),
            Logger::Level::ERROR);
        m_communicator.SendReply(request, EIO);
        return nullptr;
    }
}

void NBDProxy::SendResponse(
    const ResponseManager::ResponseCompletion& completion)
{
    PendingRequest pending;
    if (!TakePending(completion.request_id, pending))
    {
        Logger::Instance().Log("NBDProxy received completion for unknown request",
                               Logger::Level::WARNING);
        return;
    }

    ILRD_DEBUG_LOG("NBDProxy sending completion for request_id=" +
                   completion.request_id.ToString() + " state=" +
                   std::to_string(static_cast<int>(completion.state)) +
                   " status=" +
                   std::to_string(static_cast<int>(completion.status)));

    const int error_code = ErrorCodeForCompletion(completion);
    std::vector<std::uint8_t> payload;
    if (0 == error_code &&
        wire::MessageType::READ_RESP == pending.expected_response_type)
    {
        payload = completion.payload;
        if (payload.size() != pending.request.length)
        {
            payload.clear();
            m_communicator.SendReply(pending.request, EIO);
            return;
        }
    }

    m_communicator.SendReply(pending.request, error_code, payload);
}

ITask* NBDProxy::BuildTask(const NBDCommunicator::Request& request,
                           const UUID& request_id) const
{
    switch (request.type)
    {
    case NBDCommunicator::RequestType::READ:
        return new ReadTask(MakeHeader(wire::MessageType::READ_REQ,
                                       request_id,
                                       request.offset,
                                       request.length,
                                       0));
    case NBDCommunicator::RequestType::WRITE:
        return new WriteTask(MakeHeader(wire::MessageType::WRITE_REQ,
                                        request_id,
                                        request.offset,
                                        request.length,
                                        request.length),
                             request.payload);
    case NBDCommunicator::RequestType::FLUSH:
        return new FlushTask(MakeHeader(wire::MessageType::FLUSH_REQ,
                                        request_id,
                                        0,
                                        0,
                                        0));
    case NBDCommunicator::RequestType::DISCONNECT:
    case NBDCommunicator::RequestType::UNSUPPORTED:
        break;
    }

    throw std::invalid_argument("NBD request type cannot be converted to task");
}

void NBDProxy::StorePending(const UUID& request_id,
                            const NBDCommunicator::Request& request,
                            wire::MessageType expected_response_type)
{
    std::lock_guard<std::mutex> lock(m_mutex);
    m_pending[request_id] = PendingRequest{request, expected_response_type};
    ILRD_DEBUG_LOG("NBDProxy stored pending request_id=" +
                   request_id.ToString() + " expected_type=" +
                   std::to_string(static_cast<int>(expected_response_type)));
}

bool NBDProxy::TakePending(const UUID& request_id, PendingRequest& out)
{
    std::lock_guard<std::mutex> lock(m_mutex);
    std::map<UUID, PendingRequest>::iterator iter = m_pending.find(request_id);
    if (m_pending.end() == iter)
    {
        return false;
    }

    out = iter->second;
    m_pending.erase(iter);
    ILRD_DEBUG_LOG("NBDProxy took pending request_id=" + request_id.ToString());
    return true;
}

wire::MessageType NBDProxy::ExpectedResponseType(
    NBDCommunicator::RequestType request_type)
{
    switch (request_type)
    {
    case NBDCommunicator::RequestType::READ:
        return wire::MessageType::READ_RESP;
    case NBDCommunicator::RequestType::WRITE:
        return wire::MessageType::WRITE_RESP;
    case NBDCommunicator::RequestType::FLUSH:
        return wire::MessageType::FLUSH_RESP;
    case NBDCommunicator::RequestType::DISCONNECT:
    case NBDCommunicator::RequestType::UNSUPPORTED:
        break;
    }

    throw std::invalid_argument("NBD request type has no response type");
}

int NBDProxy::ErrorCodeForCompletion(
    const ResponseManager::ResponseCompletion& completion)
{
    if (ResponseManager::State::COMPLETED == completion.state &&
        (wire::StatusCode::OK == completion.status ||
         wire::StatusCode::DEGRADED_OK == completion.status))
    {
        return 0;
    }

    if (ResponseManager::State::TIMED_OUT == completion.state)
    {
        return ETIMEDOUT;
    }

    switch (completion.status)
    {
    case wire::StatusCode::BAD_LENGTH:
    case wire::StatusCode::INVALID_REQUEST:
        return EINVAL;
    case wire::StatusCode::OUT_OF_RANGE:
        return EIO;
    case wire::StatusCode::UNAVAILABLE:
        return ENODEV;
    case wire::StatusCode::IO_ERROR:
    case wire::StatusCode::INTERNAL_ERROR:
    case wire::StatusCode::UNSUPPORTED_VERSION:
    case wire::StatusCode::OK:
    case wire::StatusCode::DEGRADED_OK:
        break;
    }

    return EIO;
}

} // namespace ilrd::concrete
