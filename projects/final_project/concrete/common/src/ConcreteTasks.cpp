#include <stdexcept>
#include <utility>

#include "tasks/ConcreteTasks.hpp"

namespace ilrd::concrete
{

namespace
{

void ValidateRequestMessage(const wire::MessageV1& message)
{
    message.header.Validate();

    if (wire::IsResponseType(message.header.message_type))
    {
        throw std::invalid_argument(
            "BuildTaskFromWireMessage only accepts request messages");
    }
}

void ValidateNoPayload(const wire::MessageV1& message)
{
    if (!message.payload.empty())
    {
        throw std::invalid_argument(
            "Request message unexpectedly contains payload");
    }
}

wire::HeartbeatBodyV1 ParseHeartbeatBody(const wire::MessageV1& message)
{
    Buffer payload_buffer = wire::MakeBuffer(message.payload);
    wire::HeartbeatBodyV1 body;
    body.Deserialize(payload_buffer);
    return body;
}

} // namespace

ConcreteTask::ConcreteTask(const wire::MessageHeaderV1& header)
    : m_messageType(header.message_type),
      m_requestId(header.request_id),
      m_logicalOffset(header.logical_offset),
      m_operationLength(header.operation_length),
      m_payloadLength(header.payload_length)
{
}

int ConcreteTask::GetKey() const
{
    return ToCommandKey(m_messageType);
}

wire::MessageType ConcreteTask::GetMessageType() const
{
    return m_messageType;
}

const UUID& ConcreteTask::GetRequestId() const
{
    return m_requestId;
}

std::uint64_t ConcreteTask::GetLogicalOffset() const
{
    return m_logicalOffset;
}

std::uint32_t ConcreteTask::GetOperationLength() const
{
    return m_operationLength;
}

std::uint32_t ConcreteTask::GetPayloadLength() const
{
    return m_payloadLength;
}

ReadTask::ReadTask(const wire::MessageHeaderV1& header) : ConcreteTask(header)
{
}

WriteTask::WriteTask(const wire::MessageHeaderV1& header,
                     std::vector<std::uint8_t> data)
    : ConcreteTask(header), m_data(std::move(data))
{
}

const std::vector<std::uint8_t>& WriteTask::GetData() const
{
    return m_data;
}

FlushTask::FlushTask(const wire::MessageHeaderV1& header) : ConcreteTask(header)
{
}

HeartbeatTask::HeartbeatTask(const wire::MessageHeaderV1& header,
                             const wire::HeartbeatBodyV1& body)
    : ConcreteTask(header), m_body(body)
{
}

const wire::HeartbeatBodyV1& HeartbeatTask::GetBody() const
{
    return m_body;
}

std::unique_ptr<ITask> BuildTaskFromWireMessageUnique(
    const wire::MessageV1& message)
{
    ValidateRequestMessage(message);

    switch (message.header.message_type)
    {
    case wire::MessageType::READ_REQ:
        ValidateNoPayload(message);
        return std::unique_ptr<ITask>(new ReadTask(message.header));
    case wire::MessageType::WRITE_REQ:
        return std::unique_ptr<ITask>(
            new WriteTask(message.header, message.payload));
    case wire::MessageType::FLUSH_REQ:
        ValidateNoPayload(message);
        return std::unique_ptr<ITask>(new FlushTask(message.header));
    case wire::MessageType::HEARTBEAT_REQ:
        return std::unique_ptr<ITask>(
            new HeartbeatTask(message.header, ParseHeartbeatBody(message)));
    default:
        throw std::invalid_argument(
            "Unsupported request message type for task construction");
    }
}

ITask* BuildTaskFromWireMessage(const wire::MessageV1& message)
{
    return BuildTaskFromWireMessageUnique(message).release();
}

} // namespace ilrd::concrete
