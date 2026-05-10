/**
 * @file WireProtocol.hpp
 * @brief Declares the versioned storage wire protocol.
 */
#ifndef ILRD_CONCRETE_WIRE_PROTOCOL_HPP
#define ILRD_CONCRETE_WIRE_PROTOCOL_HPP

#include <array>
#include <cstddef>
#include <cstdint>
#include <vector>

#include "identity/UUID.hpp"
#include "serialization/Serializer.hpp"
#include "wire/WireTypes.hpp"

namespace ilrd::wire
{

/**
 * @brief Protocol magic marker stored in every V1 message header.
 */
inline constexpr std::uint32_t kMagic = 0x494C5244u; // 'ILRD' in ASCII

/**
 * @brief Supported wire protocol version.
 */
inline constexpr std::uint16_t kVersion = 1;

/**
 * @brief Serialized size of the fixed V1 header.
 */
inline constexpr std::uint16_t kHeaderSize = 64;

/**
 * @brief Maximum payload size accepted by the V1 protocol.
 */
inline constexpr std::uint32_t kMaxPayloadBytes = 1024u * 1024u;

/**
 * @brief Request and response message types defined by protocol V1.
 */
enum class MessageType : std::uint16_t
{
    READ_REQ = 1,
    WRITE_REQ = 2,
    FLUSH_REQ = 3,
    HEARTBEAT_REQ = 4,
    READ_RESP = 101,
    WRITE_RESP = 102,
    FLUSH_RESP = 103,
    HEARTBEAT_RESP = 104
};

/**
 * @brief Status codes carried by protocol responses.
 */
enum class StatusCode : std::uint16_t
{
    OK = 0,
    DEGRADED_OK = 1,
    INVALID_REQUEST = 2,
    UNSUPPORTED_VERSION = 3,
    BAD_LENGTH = 4,
    OUT_OF_RANGE = 5,
    UNAVAILABLE = 6,
    IO_ERROR = 7,
    INTERNAL_ERROR = 8
};

/**
 * @brief Node health values exchanged via heartbeat messages.
 */
enum class HealthState : std::uint8_t
{
    HEALTHY = 0,
    DEGRADED = 1,
    RECOVERY_IN_PROGRESS = 2,
    REBALANCE_REQUIRED = 3
};

/**
 * @brief Bit flags stored in the V1 message header.
 */
enum MessageFlags : std::uint16_t
{
    FLAG_RESPONSE = 1u << 0,
    FLAG_HAS_PAYLOAD = 1u << 1,
    FLAG_DEGRADED = 1u << 2,
    FLAG_RETRYABLE = 1u << 3
};

/**
 * @brief Mask of all currently recognized flag bits.
 */
inline constexpr std::uint16_t kKnownFlagsMask =
    FLAG_RESPONSE | FLAG_HAS_PAYLOAD | FLAG_DEGRADED | FLAG_RETRYABLE;

/**
 * @brief Checks whether `type` is a defined V1 message type.
 * @param type Candidate message type.
 * @return `true` if `type` is recognized.
 */
inline bool IsKnownMessageType(MessageType type)
{
    switch (type)
    {
    case MessageType::READ_REQ:
    case MessageType::WRITE_REQ:
    case MessageType::FLUSH_REQ:
    case MessageType::HEARTBEAT_REQ:
    case MessageType::READ_RESP:
    case MessageType::WRITE_RESP:
    case MessageType::FLUSH_RESP:
    case MessageType::HEARTBEAT_RESP:
        return true;
    }

    return false;
}

/**
 * @brief Checks whether `status` is a defined V1 status code.
 * @param status Candidate status.
 * @return `true` if `status` is recognized.
 */
inline bool IsKnownStatus(StatusCode status)
{
    switch (status)
    {
    case StatusCode::OK:
    case StatusCode::DEGRADED_OK:
    case StatusCode::INVALID_REQUEST:
    case StatusCode::UNSUPPORTED_VERSION:
    case StatusCode::BAD_LENGTH:
    case StatusCode::OUT_OF_RANGE:
    case StatusCode::UNAVAILABLE:
    case StatusCode::IO_ERROR:
    case StatusCode::INTERNAL_ERROR:
        return true;
    }

    return false;
}

/**
 * @brief Checks whether `state` is a defined heartbeat health state.
 * @param state Candidate health state.
 * @return `true` if `state` is recognized.
 */
inline bool IsKnownHealthState(HealthState state)
{
    switch (state)
    {
    case HealthState::HEALTHY:
    case HealthState::DEGRADED:
    case HealthState::RECOVERY_IN_PROGRESS:
    case HealthState::REBALANCE_REQUIRED:
        return true;
    }

    return false;
}

/**
 * @brief Checks whether `type` is one of the response message types.
 * @param type Candidate message type.
 * @return `true` if `type` is a response type.
 */
inline bool IsResponseType(MessageType type)
{
    switch (type)
    {
    case MessageType::READ_RESP:
    case MessageType::WRITE_RESP:
    case MessageType::FLUSH_RESP:
    case MessageType::HEARTBEAT_RESP:
        return true;
    default:
        return false;
    }
}

/**
 * @brief Heartbeat request body carried by `HEARTBEAT_REQ`.
 */
struct HeartbeatBodyV1
{
    static constexpr std::size_t SERIALIZED_SIZE = UUID::SERIALIZED_SIZE + 16;

    UUID node_id;
    std::uint64_t heartbeat_seq = 0;
    HealthState health_state = HealthState::HEALTHY;
    std::array<std::uint8_t, 7> reserved = {};

    Buffer& Serialize(Buffer& buffer) const
    {
        node_id.Serialize(buffer);
        buffer << u64(heartbeat_seq);
        buffer << u8(static_cast<std::uint8_t>(health_state));
        WriteBytes(buffer, reserved);
        return buffer;
    }

    Buffer& Deserialize(Buffer& buffer)
    {
        node_id.Deserialize(buffer);
        U64 seq;
        U8 raw_state;

        buffer >> seq;
        buffer >> raw_state;

        heartbeat_seq = seq.value;
        health_state = static_cast<HealthState>(raw_state.value);
        reserved = ReadFixedBytes<7>(buffer);
        Validate();
        return buffer;
    }

    /**
     * @brief Validates protocol invariants for the decoded body.
     */
    void Validate() const
    {
        Require(IsKnownHealthState(health_state), "Unknown health state");
        for (std::size_t i = 0; i < reserved.size(); ++i)
        {
            Require(0 == reserved[i], "Heartbeat reserved bytes must be zero");
        }
    }
};

/**
 * @brief Heartbeat response body carried by `HEARTBEAT_RESP`.
 */
struct HeartbeatAckBodyV1
{
    static constexpr std::size_t SERIALIZED_SIZE = UUID::SERIALIZED_SIZE + 16;

    UUID node_id;
    std::uint64_t acked_seq = 0;
    HealthState accepted_state = HealthState::HEALTHY;
    std::array<std::uint8_t, 7> reserved = {};

    Buffer& Serialize(Buffer& buffer) const
    {
        node_id.Serialize(buffer);
        buffer << u64(acked_seq);
        buffer << u8(static_cast<std::uint8_t>(accepted_state));
        WriteBytes(buffer, reserved);
        return buffer;
    }

    Buffer& Deserialize(Buffer& buffer)
    {
        node_id.Deserialize(buffer);
        U64 seq;
        U8 raw_state;

        buffer >> seq;
        buffer >> raw_state;

        acked_seq = seq.value;
        accepted_state = static_cast<HealthState>(raw_state.value);
        reserved = ReadFixedBytes<7>(buffer);
        Validate();
        return buffer;
    }

    /**
     * @brief Validates protocol invariants for the decoded body.
     */
    void Validate() const
    {
        Require(IsKnownHealthState(accepted_state), "Unknown accepted health state");
        for (std::size_t i = 0; i < reserved.size(); ++i)
        {
            Require(0 == reserved[i], "Heartbeat ack reserved bytes must be zero");
        }
    }
};

/**
 * @brief Fixed-size V1 message header.
 */
struct MessageHeaderV1
{
    std::uint32_t magic = kMagic;
    std::uint16_t version = kVersion;
    std::uint16_t header_size = kHeaderSize;
    MessageType message_type = MessageType::READ_REQ;
    std::uint16_t flags = 0;
    StatusCode status_code = StatusCode::OK;
    std::uint16_t reserved0 = 0;
    UUID request_id = {};
    std::uint64_t logical_offset = 0;
    std::uint32_t operation_length = 0;
    std::uint32_t payload_length = 0;
    std::array<std::uint8_t, 8> reserved1 = {};

    Buffer& Serialize(Buffer& buffer) const
    {
        Validate();
        buffer << u32(magic);
        buffer << u16(version);
        buffer << u16(header_size);
        buffer << u16(static_cast<std::uint16_t>(message_type));
        buffer << u16(flags);
        buffer << u16(static_cast<std::uint16_t>(status_code));
        buffer << u16(reserved0);
        request_id.Serialize(buffer);
        buffer << u64(logical_offset);
        buffer << u32(operation_length);
        buffer << u32(payload_length);
        WriteBytes(buffer, reserved1);
        return buffer;
    }

    Buffer& Deserialize(Buffer& buffer)
    {
        U32 wire_magic;
        U16 wire_version;
        U16 wire_header_size;
        U16 wire_type;
        U16 wire_flags;
        U16 wire_status;
        U16 wire_reserved0;

        buffer >> wire_magic;
        buffer >> wire_version;
        buffer >> wire_header_size;
        buffer >> wire_type;
        buffer >> wire_flags;
        buffer >> wire_status;
        buffer >> wire_reserved0;

        magic = wire_magic.value;
        version = wire_version.value;
        header_size = wire_header_size.value;
        message_type = static_cast<MessageType>(wire_type.value);
        flags = wire_flags.value;
        status_code = static_cast<StatusCode>(wire_status.value);
        reserved0 = wire_reserved0.value;
        request_id.Deserialize(buffer);
        U64 wire_offset;
        U32 wire_operation_length;
        U32 wire_payload_length;

        buffer >> wire_offset;
        buffer >> wire_operation_length;
        buffer >> wire_payload_length;

        logical_offset = wire_offset.value;
        operation_length = wire_operation_length.value;
        payload_length = wire_payload_length.value;
        reserved1 = ReadFixedBytes<8>(buffer);
        Validate();
        return buffer;
    }

    /**
     * @brief Checks whether a flag bit is set.
     * @param flag Flag to query.
     * @return `true` if the flag bit is set.
     */
    bool HasFlag(MessageFlags flag) const
    {
        return 0 != (flags & static_cast<std::uint16_t>(flag));
    }

    /**
     * @brief Sets or clears a flag bit.
     * @param flag Flag to mutate.
     * @param enabled Whether the flag should be present after the call.
     */
    void SetFlag(MessageFlags flag, bool enabled = true)
    {
        const std::uint16_t mask = static_cast<std::uint16_t>(flag);
        if (enabled)
        {
            flags = static_cast<std::uint16_t>(flags | mask);
        }
        else
        {
            flags = static_cast<std::uint16_t>(flags & ~mask);
        }
    }

    /**
     * @brief Validates header-level protocol invariants.
     */
    void Validate() const
    {
        Require(kMagic == magic, "Invalid wire magic");
        Require(kVersion == version, "Unsupported wire version");
        Require(kHeaderSize == header_size, "Invalid header size");
        Require(IsKnownMessageType(message_type), "Unknown message type");
        Require(IsKnownStatus(status_code), "Unknown status code");
        Require(0 == reserved0, "reserved0 must be zero");
        Require(payload_length <= kMaxPayloadBytes, "Payload exceeds V1 maximum");
        Require(0 == (flags & ~kKnownFlagsMask), "Unknown flag bits are set");

        for (std::size_t i = 0; i < reserved1.size(); ++i)
        {
            Require(0 == reserved1[i], "reserved1 bytes must be zero");
        }

        const bool is_response_type = IsResponseType(message_type);
        Require(is_response_type == HasFlag(FLAG_RESPONSE),
                "FLAG_RESPONSE must match message type");

        if (is_response_type)
        {
            Require(status_code != StatusCode::OK || !HasFlag(FLAG_DEGRADED),
                    "FLAG_DEGRADED cannot be set with OK status");
        }
        else
        {
            Require(StatusCode::OK == status_code,
                    "Requests must carry OK status in V1");
            Require(!HasFlag(FLAG_DEGRADED),
                    "Requests must not set FLAG_DEGRADED");
        }

        Require((status_code == StatusCode::DEGRADED_OK) == HasFlag(FLAG_DEGRADED),
                "FLAG_DEGRADED must match DEGRADED_OK status");

        switch (message_type)
        {
        case MessageType::READ_REQ:
            Require(0 == payload_length, "READ_REQ must not carry payload");
            Require(0 != operation_length, "READ_REQ must request nonzero length");
            Require(!HasFlag(FLAG_HAS_PAYLOAD), "READ_REQ must not set payload flag");
            break;
        case MessageType::WRITE_REQ:
            Require(0 != operation_length, "WRITE_REQ must write nonzero length");
            Require(operation_length == payload_length,
                    "WRITE_REQ payload must match operation length");
            Require(HasFlag(FLAG_HAS_PAYLOAD), "WRITE_REQ must set payload flag");
            break;
        case MessageType::FLUSH_REQ:
            Require(0 == operation_length, "FLUSH_REQ operation length must be zero");
            Require(0 == payload_length, "FLUSH_REQ must not carry payload");
            Require(!HasFlag(FLAG_HAS_PAYLOAD), "FLUSH_REQ must not set payload flag");
            break;
        case MessageType::HEARTBEAT_REQ:
            Require(0 == logical_offset, "HEARTBEAT_REQ offset must be zero");
            Require(0 == operation_length, "HEARTBEAT_REQ length must be zero");
            Require(HeartbeatBodyV1::SERIALIZED_SIZE == payload_length,
                    "HEARTBEAT_REQ payload size mismatch");
            Require(HasFlag(FLAG_HAS_PAYLOAD),
                    "HEARTBEAT_REQ must set payload flag");
            break;
        case MessageType::READ_RESP:
            Require(0 != operation_length, "READ_RESP operation length must be nonzero");
            if (StatusCode::OK == status_code || StatusCode::DEGRADED_OK == status_code)
            {
                Require(operation_length == payload_length,
                        "READ_RESP success payload must match operation length");
                Require(HasFlag(FLAG_HAS_PAYLOAD),
                        "READ_RESP success must set payload flag");
            }
            else
            {
                Require(0 == payload_length, "READ_RESP error must not carry payload");
                Require(!HasFlag(FLAG_HAS_PAYLOAD),
                        "READ_RESP error must clear payload flag");
            }
            break;
        case MessageType::WRITE_RESP:
        case MessageType::FLUSH_RESP:
            Require(0 == payload_length, "Write/flush responses must not carry payload");
            Require(!HasFlag(FLAG_HAS_PAYLOAD),
                    "Write/flush responses must clear payload flag");
            break;
        case MessageType::HEARTBEAT_RESP:
            Require(0 == logical_offset, "HEARTBEAT_RESP offset must be zero");
            Require(0 == operation_length, "HEARTBEAT_RESP length must be zero");
            Require(HeartbeatAckBodyV1::SERIALIZED_SIZE == payload_length,
                    "HEARTBEAT_RESP payload size mismatch");
            Require(HasFlag(FLAG_HAS_PAYLOAD),
                    "HEARTBEAT_RESP must set payload flag");
            break;
        }
    }
};

/**
 * @brief Full V1 message consisting of a validated header and optional payload.
 */
struct MessageV1
{
    MessageHeaderV1 header;
    std::vector<std::uint8_t> payload;

    Buffer& Serialize(Buffer& buffer) const
    {
        Require(payload.size() == header.payload_length,
                "Payload vector size must match header payload_length");
        header.Serialize(buffer);
        if (!payload.empty())
        {
            WriteBytes(buffer, payload.data(), payload.size());
        }

        return buffer;
    }

    Buffer& Deserialize(Buffer& buffer)
    {
        header.Deserialize(buffer);
        payload = ReadBytes(buffer, header.payload_length);
        return buffer;
    }
};

} // namespace ilrd::wire

#endif // ILRD_CONCRETE_WIRE_PROTOCOL_HPP
