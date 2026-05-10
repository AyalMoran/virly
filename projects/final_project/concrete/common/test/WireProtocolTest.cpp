#include <cstdint>
#include <cstring>
#include <stdexcept>
#include <vector>

#include "serialization/Serializer.hpp"
#include "wire/WireProtocol.hpp"
#include "test_utils.hpp"

namespace
{

using ilrd::Buffer;
using ilrd::UUID;
using ilrd::wire::FLAG_DEGRADED;
using ilrd::wire::FLAG_HAS_PAYLOAD;
using ilrd::wire::FLAG_RESPONSE;
using ilrd::wire::HealthState;
using ilrd::wire::HeartbeatAckBodyV1;
using ilrd::wire::HeartbeatBodyV1;
using ilrd::wire::MessageHeaderV1;
using ilrd::wire::MessageType;
using ilrd::wire::MessageV1;
using ilrd::wire::StatusCode;

// UUID MakeRequestId()
// {
//     return UUID(0x0102030405060708ULL, 0x1112131415161718LL, 0xA1B2C3D4u,
//                 0x0A141E28u);
// }

void TestHeaderRoundTrip()
{
    INIT_SUITE(suite, "Wire Header Round Trip");
    BEGIN_SUITE(suite);

    MessageHeaderV1 header;
    header.message_type = MessageType::WRITE_REQ;
    header.logical_offset = 0x2122232425262728ULL;
    header.operation_length = 4;
    header.payload_length = 4;
    header.SetFlag(FLAG_HAS_PAYLOAD);

    Buffer buffer;
    header.Serialize(buffer);

    MessageHeaderV1 decoded;
    decoded.Deserialize(buffer);

    ASSERT_EQ(suite, ilrd::wire::kHeaderSize, buffer.GetSize());
    ASSERT_EQ(suite, static_cast<int>(header.message_type),
              static_cast<int>(decoded.message_type));
    ASSERT_EQ(suite, header.flags, decoded.flags);
    ASSERT_EQ(suite, header.operation_length, decoded.operation_length);
    ASSERT_EQ(suite, header.payload_length, decoded.payload_length);
    ASSERT_EQ(suite, header.logical_offset, decoded.logical_offset);
    ASSERT_TRUE(suite, decoded.request_id == header.request_id);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestHeaderBigEndianPrefix()
{
    INIT_SUITE(suite, "Wire Header Endianness");
    BEGIN_SUITE(suite);

    MessageHeaderV1 header;
    header.message_type = MessageType::WRITE_REQ;
    header.flags = FLAG_HAS_PAYLOAD;
    header.operation_length = 4;
    header.payload_length = 4;

    Buffer buffer;
    header.Serialize(buffer);

    const std::uint8_t* bytes = buffer.GetData();
    const std::uint8_t expected_prefix[] = {
        0x49, 0x4C, 0x52, 0x44, // magic
        0x00, 0x01,             // version
        0x00, 0x40,             // header size
        0x00, 0x02,             // message type
        0x00, 0x02,             // flags
        0x00, 0x00,             // status
        0x00, 0x00              // reserved0
    };

    ASSERT_MEM_EQ(suite, expected_prefix, bytes, sizeof(expected_prefix));

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestHeartbeatRoundTrip()
{
    INIT_SUITE(suite, "Heartbeat Message");
    BEGIN_SUITE(suite);

    HeartbeatBodyV1 body;
    body.node_id = UUID(9, 10, 11, 0x01020304u);
    body.heartbeat_seq = 77;
    body.health_state = HealthState::RECOVERY_IN_PROGRESS;

    Buffer payload_buffer;
    body.Serialize(payload_buffer);

    MessageV1 message;
    message.header.message_type = MessageType::HEARTBEAT_REQ;
    message.header.payload_length = payload_buffer.GetSize();
    message.header.SetFlag(FLAG_HAS_PAYLOAD);
    message.payload.assign(payload_buffer.GetData(),
                           payload_buffer.GetData() + payload_buffer.GetSize());

    Buffer encoded;
    message.Serialize(encoded);

    MessageV1 decoded;
    decoded.Deserialize(encoded);

    Buffer decoded_payload = ilrd::wire::MakeBuffer(decoded.payload);
    HeartbeatBodyV1 decoded_body;
    decoded_body.Deserialize(decoded_payload);

    ASSERT_EQ(suite, static_cast<int>(MessageType::HEARTBEAT_REQ),
              static_cast<int>(decoded.header.message_type));
    ASSERT_TRUE(suite, decoded_body.node_id == body.node_id);
    ASSERT_EQ(suite, body.heartbeat_seq, decoded_body.heartbeat_seq);
    ASSERT_EQ(suite, static_cast<int>(body.health_state),
              static_cast<int>(decoded_body.health_state));

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestReadResponseErrorHasNoPayload()
{
    INIT_SUITE(suite, "Read Response Error Rules");
    BEGIN_SUITE(suite);

    MessageHeaderV1 header;
    header.message_type = MessageType::READ_RESP;
    header.operation_length = 128;
    header.status_code = StatusCode::IO_ERROR;
    header.SetFlag(FLAG_RESPONSE);

    Buffer buffer;
    header.Serialize(buffer);

    MessageHeaderV1 decoded;
    decoded.Deserialize(buffer);

    ASSERT_EQ(suite, static_cast<int>(StatusCode::IO_ERROR),
              static_cast<int>(decoded.status_code));
    ASSERT_EQ(suite, 0u, decoded.payload_length);
    ASSERT_FALSE(suite, decoded.HasFlag(FLAG_HAS_PAYLOAD));

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestRejectReservedBytes()
{
    INIT_SUITE(suite, "Reserved Bytes Validation");
    BEGIN_SUITE(suite);

    MessageHeaderV1 header;
    header.message_type = MessageType::FLUSH_REQ;

    Buffer valid_buffer;
    header.Serialize(valid_buffer);

    std::vector<std::uint8_t> bytes(valid_buffer.GetData(),
                                    valid_buffer.GetData() + valid_buffer.GetSize());
    bytes[56] = 0xAB;

    bool threw = false;
    try
    {
        Buffer invalid_buffer = ilrd::wire::MakeBuffer(bytes);
        MessageHeaderV1 decoded;
        decoded.Deserialize(invalid_buffer);
    }
    catch (const std::runtime_error&)
    {
        threw = true;
    }

    ASSERT_TRUE(suite, threw);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestRejectWriteLengthMismatch()
{
    INIT_SUITE(suite, "Write Length Validation");
    BEGIN_SUITE(suite);

    bool threw = false;
    try
    {
        MessageHeaderV1 header;
        header.message_type = MessageType::WRITE_REQ;
        header.operation_length = 8;
        header.payload_length = 4;
        header.SetFlag(FLAG_HAS_PAYLOAD);

        Buffer buffer;
        header.Serialize(buffer);
    }
    catch (const std::runtime_error&)
    {
        threw = true;
    }

    ASSERT_TRUE(suite, threw);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestHeartbeatAckRoundTrip()
{
    INIT_SUITE(suite, "Heartbeat Ack");
    BEGIN_SUITE(suite);

    HeartbeatAckBodyV1 body;
    body.node_id = UUID(4, 5, 6, 0x0A0B0C0Du);
    body.acked_seq = 999;
    body.accepted_state = HealthState::DEGRADED;

    Buffer buffer;
    body.Serialize(buffer);

    HeartbeatAckBodyV1 decoded;
    decoded.Deserialize(buffer);

    ASSERT_TRUE(suite, decoded.node_id == body.node_id);
    ASSERT_EQ(suite, body.acked_seq, decoded.acked_seq);
    ASSERT_EQ(suite, static_cast<int>(body.accepted_state),
              static_cast<int>(decoded.accepted_state));

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

} // namespace

int main()
{
    PRINT_TEST_HEADER("Wire Protocol");

    TestHeaderRoundTrip();
    TestHeaderBigEndianPrefix();
    TestHeartbeatRoundTrip();
    TestHeartbeatAckRoundTrip();
    TestReadResponseErrorHasNoPayload();
    TestRejectReservedBytes();
    TestRejectWriteLengthMismatch();

    PRINT_SUMMARY();

    return 0;
}
