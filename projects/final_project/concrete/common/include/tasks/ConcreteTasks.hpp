/**
 * @file ConcreteTasks.hpp
 * @brief Declares framework tasks built from concrete wire messages.
 */
#ifndef ILRD_CONCRETE_TASKS_HPP
#define ILRD_CONCRETE_TASKS_HPP

#include <cstdint>
#include <memory>
#include <vector>

#include "Framework.hpp"
#include "identity/UUID.hpp"
#include "wire/WireProtocol.hpp"

namespace ilrd::concrete
{

/**
 * @brief Converts a wire message type into the command key used by the framework.
 * @param type Wire message type.
 * @return Integer key used for command dispatch.
 */
constexpr int ToCommandKey(wire::MessageType type)
{
    return static_cast<int>(type);
}

inline constexpr int READ_COMMAND_KEY =
    ToCommandKey(wire::MessageType::READ_REQ);
inline constexpr int WRITE_COMMAND_KEY =
    ToCommandKey(wire::MessageType::WRITE_REQ);
inline constexpr int FLUSH_COMMAND_KEY =
    ToCommandKey(wire::MessageType::FLUSH_REQ);
inline constexpr int HEARTBEAT_COMMAND_KEY =
    ToCommandKey(wire::MessageType::HEARTBEAT_REQ);

/**
 * @brief Base framework task for parsed wire requests.
 */
class ConcreteTask : public ITask
{
  public:
    /**
     * @brief Builds a task from a parsed message header.
     * @param header Request header to expose through the task API.
     */
    explicit ConcreteTask(const wire::MessageHeaderV1& header);
    ~ConcreteTask() override = default;

    /**
     * @brief Returns the framework command key for this request.
     * @return Integer command key derived from the message type.
     */
    int GetKey() const override;

    /**
     * @brief Returns the message type carried by the request.
     * @return Wire message type.
     */
    wire::MessageType GetMessageType() const;

    /**
     * @brief Returns the request UUID.
     * @return Wire request id.
     */
    const UUID& GetRequestId() const;

    /**
     * @brief Returns the logical data offset referenced by the request.
     * @return Logical byte offset.
     */
    std::uint64_t GetLogicalOffset() const;

    /**
     * @brief Returns the logical operation length from the header.
     * @return Requested byte length.
     */
    std::uint32_t GetOperationLength() const;

    /**
     * @brief Returns the payload length from the header.
     * @return Serialized payload size in bytes.
     */
    std::uint32_t GetPayloadLength() const;

  private:
    wire::MessageType m_messageType;
    UUID m_requestId;
    std::uint64_t m_logicalOffset;
    std::uint32_t m_operationLength;
    std::uint32_t m_payloadLength;
};

/**
 * @brief Task representing a read request.
 */
class ReadTask : public ConcreteTask
{
  public:
    /**
     * @brief Builds a read task from the request header.
     * @param header Parsed read request header.
     */
    explicit ReadTask(const wire::MessageHeaderV1& header);
};

/**
 * @brief Task representing a write request with payload data.
 */
class WriteTask : public ConcreteTask
{
  public:
    /**
     * @brief Builds a write task from the request header and payload.
     * @param header Parsed write request header.
     * @param data Payload bytes to write.
     */
    WriteTask(const wire::MessageHeaderV1& header,
              std::vector<std::uint8_t> data);

    /**
     * @brief Returns the request payload bytes.
     * @return Write payload.
     */
    const std::vector<std::uint8_t>& GetData() const;

  private:
    std::vector<std::uint8_t> m_data;
};

/**
 * @brief Task representing a flush request.
 */
class FlushTask : public ConcreteTask
{
  public:
    /**
     * @brief Builds a flush task from the request header.
     * @param header Parsed flush request header.
     */
    explicit FlushTask(const wire::MessageHeaderV1& header);
};

/**
 * @brief Task representing a heartbeat request and body.
 */
class HeartbeatTask : public ConcreteTask
{
  public:
    /**
     * @brief Builds a heartbeat task from header and decoded body.
     * @param header Parsed heartbeat request header.
     * @param body Parsed heartbeat body.
     */
    HeartbeatTask(const wire::MessageHeaderV1& header,
                  const wire::HeartbeatBodyV1& body);

    /**
     * @brief Returns the parsed heartbeat body.
     * @return Heartbeat payload.
     */
    const wire::HeartbeatBodyV1& GetBody() const;

  private:
    wire::HeartbeatBodyV1 m_body;
};

/**
 * @brief Builds a framework task from a parsed wire message.
 * @param message Parsed message.
 * @return Owning pointer to the created task.
 */
std::unique_ptr<ITask> BuildTaskFromWireMessageUnique(
    const wire::MessageV1& message);

/**
 * @brief Builds a framework task from a parsed wire message.
 * @param message Parsed message.
 * @return Newly allocated task owned by the caller.
 */
ITask* BuildTaskFromWireMessage(const wire::MessageV1& message);

} // namespace ilrd::concrete

#endif // ILRD_CONCRETE_TASKS_HPP
