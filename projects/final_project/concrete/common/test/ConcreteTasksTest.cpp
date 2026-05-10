#include <cstdint>
#include <memory>
#include <stdexcept>
#include <vector>

#include "tasks/ConcreteTasks.hpp"
#include "wire/WireProtocol.hpp"
#include "test_utils.hpp"

namespace
{

using ilrd::ITask;
using ilrd::UUID;
using ilrd::concrete::BuildTaskFromWireMessageUnique;
using ilrd::concrete::FLUSH_COMMAND_KEY;
using ilrd::concrete::FlushTask;
using ilrd::concrete::HEARTBEAT_COMMAND_KEY;
using ilrd::concrete::HeartbeatTask;
using ilrd::concrete::READ_COMMAND_KEY;
using ilrd::concrete::ReadTask;
using ilrd::concrete::WRITE_COMMAND_KEY;
using ilrd::concrete::WriteTask;
using ilrd::wire::FLAG_HAS_PAYLOAD;
using ilrd::wire::FLAG_RESPONSE;
using ilrd::wire::HealthState;
using ilrd::wire::HeartbeatBodyV1;
using ilrd::wire::MessageType;
using ilrd::wire::MessageV1;
using ilrd::wire::StatusCode;

void TestReadTaskBuild()
{
    INIT_SUITE(suite, "Concrete Read Task");
    BEGIN_SUITE(suite);

    MessageV1 message;
    message.header.message_type = MessageType::READ_REQ;
    message.header.request_id = UUID(1, 2, 3, 4);
    message.header.logical_offset = 4096;
    message.header.operation_length = 512;

    std::unique_ptr<ITask> task = BuildTaskFromWireMessageUnique(message);
    ReadTask* read_task = dynamic_cast<ReadTask*>(task.get());

    ASSERT_NOT_NULL(suite, read_task);
    ASSERT_EQ(suite, READ_COMMAND_KEY, read_task->GetKey());
    ASSERT_EQ(suite, 4096ULL, read_task->GetLogicalOffset());
    ASSERT_EQ(suite, 512u, read_task->GetOperationLength());
    ASSERT_TRUE(suite, read_task->GetRequestId() == message.header.request_id);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestWriteTaskBuild()
{
    INIT_SUITE(suite, "Concrete Write Task");
    BEGIN_SUITE(suite);

    MessageV1 message;
    message.header.message_type = MessageType::WRITE_REQ;
    message.header.request_id = UUID(5, 6, 7, 8);
    message.header.logical_offset = 8192;
    message.header.operation_length = 4;
    message.header.payload_length = 4;
    message.header.SetFlag(FLAG_HAS_PAYLOAD);
    message.payload.push_back(0x10);
    message.payload.push_back(0x20);
    message.payload.push_back(0x30);
    message.payload.push_back(0x40);

    std::unique_ptr<ITask> task = BuildTaskFromWireMessageUnique(message);
    WriteTask* write_task = dynamic_cast<WriteTask*>(task.get());

    ASSERT_NOT_NULL(suite, write_task);
    ASSERT_EQ(suite, WRITE_COMMAND_KEY, write_task->GetKey());
    ASSERT_EQ(suite, 8192ULL, write_task->GetLogicalOffset());
    ASSERT_EQ(suite, 4u, write_task->GetOperationLength());
    ASSERT_EQ(suite, 4u, write_task->GetPayloadLength());
    ASSERT_EQ(suite, 4u, write_task->GetData().size());
    ASSERT_EQ(suite, 0x10, write_task->GetData()[0]);
    ASSERT_EQ(suite, 0x40, write_task->GetData()[3]);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestFlushTaskBuild()
{
    INIT_SUITE(suite, "Concrete Flush Task");
    BEGIN_SUITE(suite);

    MessageV1 message;
    message.header.message_type = MessageType::FLUSH_REQ;
    message.header.request_id = UUID(9, 10, 11, 12);

    std::unique_ptr<ITask> task = BuildTaskFromWireMessageUnique(message);
    FlushTask* flush_task = dynamic_cast<FlushTask*>(task.get());

    ASSERT_NOT_NULL(suite, flush_task);
    ASSERT_EQ(suite, FLUSH_COMMAND_KEY, flush_task->GetKey());
    ASSERT_EQ(suite, 0u, flush_task->GetOperationLength());
    ASSERT_EQ(suite, 0u, flush_task->GetPayloadLength());

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestHeartbeatTaskBuild()
{
    INIT_SUITE(suite, "Concrete Heartbeat Task");
    BEGIN_SUITE(suite);

    HeartbeatBodyV1 body;
    body.node_id = UUID(13, 14, 15, 16);
    body.heartbeat_seq = 77;
    body.health_state = HealthState::DEGRADED;

    ilrd::Buffer payload_buffer;
    body.Serialize(payload_buffer);

    MessageV1 message;
    message.header.message_type = MessageType::HEARTBEAT_REQ;
    message.header.payload_length = payload_buffer.GetSize();
    message.header.SetFlag(FLAG_HAS_PAYLOAD);
    message.payload.assign(payload_buffer.GetData(),
                           payload_buffer.GetData() + payload_buffer.GetSize());

    std::unique_ptr<ITask> task = BuildTaskFromWireMessageUnique(message);
    HeartbeatTask* heartbeat_task = dynamic_cast<HeartbeatTask*>(task.get());

    ASSERT_NOT_NULL(suite, heartbeat_task);
    ASSERT_EQ(suite, HEARTBEAT_COMMAND_KEY, heartbeat_task->GetKey());
    ASSERT_EQ(suite, 0u, heartbeat_task->GetOperationLength());
    ASSERT_TRUE(suite, heartbeat_task->GetBody().node_id == body.node_id);
    ASSERT_EQ(suite, 77ULL, heartbeat_task->GetBody().heartbeat_seq);
    ASSERT_EQ(suite, static_cast<int>(HealthState::DEGRADED),
              static_cast<int>(heartbeat_task->GetBody().health_state));

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestRejectResponseType()
{
    INIT_SUITE(suite, "Reject Response Messages");
    BEGIN_SUITE(suite);

    bool threw = false;
    try
    {
        MessageV1 message;
        message.header.message_type = MessageType::WRITE_RESP;
        message.header.SetFlag(FLAG_RESPONSE);
        message.header.status_code = StatusCode::OK;
        BuildTaskFromWireMessageUnique(message);
    }
    catch (const std::invalid_argument&)
    {
        threw = true;
    }

    ASSERT_TRUE(suite, threw);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestRejectFlushPayload()
{
    INIT_SUITE(suite, "Reject Unexpected Flush Payload");
    BEGIN_SUITE(suite);

    bool threw = false;
    try
    {
        MessageV1 message;
        message.header.message_type = MessageType::FLUSH_REQ;
        message.payload.push_back(0xAB);
        BuildTaskFromWireMessageUnique(message);
    }
    catch (const std::runtime_error&)
    {
        threw = true;
    }
    catch (const std::invalid_argument&)
    {
        threw = true;
    }

    ASSERT_TRUE(suite, threw);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

} // namespace

int main()
{
    PRINT_TEST_HEADER("Concrete Tasks");

    TestReadTaskBuild();
    TestWriteTaskBuild();
    TestFlushTaskBuild();
    TestHeartbeatTaskBuild();
    TestRejectResponseType();
    TestRejectFlushPayload();

    PRINT_SUMMARY();

    return 0;
}
