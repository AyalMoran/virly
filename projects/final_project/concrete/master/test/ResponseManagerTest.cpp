#include <chrono>
#include <cstddef>
#include <stdexcept>
#include <thread>
#include <vector>

#include "identity/UUID.hpp"
#include "response/ResponseManager.hpp"
#include "wire/WireProtocol.hpp"
#include "test_utils.hpp"

namespace
{

using ilrd::UUID;
using ilrd::concrete::ResponseManager;
using ilrd::wire::FLAG_HAS_PAYLOAD;
using ilrd::wire::FLAG_RESPONSE;
using ilrd::wire::MessageType;
using ilrd::wire::MessageV1;
using ilrd::wire::StatusCode;

struct CallbackCapture
{
    std::size_t count = 0;
    ResponseManager::ResponseCompletion completion = {};

    ResponseManager::CompletionCallback Callback()
    {
        return [this](const ResponseManager::ResponseCompletion& result)
        {
            ++count;
            completion = result;
        };
    }
};

MessageV1 MakeWriteResponse(const UUID& request_id,
                             StatusCode status = StatusCode::OK)
{
    MessageV1 response;
    response.header.message_type = MessageType::WRITE_RESP;
    response.header.SetFlag(FLAG_RESPONSE);
    response.header.status_code = status;
    response.header.request_id = request_id;
    response.header.logical_offset = 128;
    response.header.operation_length = 4;
    return response;
}

MessageV1 MakeReadResponse(const UUID& request_id,
                            const std::vector<std::uint8_t>& payload)
{
    MessageV1 response;
    response.header.message_type = MessageType::READ_RESP;
    response.header.SetFlag(FLAG_RESPONSE);
    response.header.SetFlag(FLAG_HAS_PAYLOAD);
    response.header.request_id = request_id;
    response.header.logical_offset = 256;
    response.header.operation_length = static_cast<std::uint32_t>(payload.size());
    response.header.payload_length = static_cast<std::uint32_t>(payload.size());
    response.payload = payload;
    return response;
}

void TestRegisterPendingRequest()
{
    INIT_SUITE(suite, "ResponseManager Register Pending");
    BEGIN_SUITE(suite);

    ResponseManager manager;
    const UUID request_id(1, 2, 3, 4);
    manager.RegisterRequest(request_id, MessageType::WRITE_RESP);

    const ResponseManager::Snapshot snapshot =
        manager.GetSnapshot(request_id);

    ASSERT_EQ(suite, 1u, manager.PendingCount());
    ASSERT_EQ(suite, static_cast<int>(ResponseManager::State::PENDING),
              static_cast<int>(snapshot.state));
    ASSERT_FALSE(suite, snapshot.has_response);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestRejectDuplicateRegistration()
{
    INIT_SUITE(suite, "ResponseManager Reject Duplicate");
    BEGIN_SUITE(suite);

    ResponseManager manager;
    const UUID request_id(2, 3, 4, 5);
    manager.RegisterRequest(request_id, MessageType::WRITE_RESP);

    bool threw = false;
    try
    {
        manager.RegisterRequest(request_id, MessageType::WRITE_RESP);
    }
    catch (const std::invalid_argument&)
    {
        threw = true;
    }

    ASSERT_TRUE(suite, threw);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestRejectNonResponseExpectedType()
{
    INIT_SUITE(suite, "ResponseManager Reject Non Response Expected");
    BEGIN_SUITE(suite);

    ResponseManager manager;
    bool threw = false;
    try
    {
        manager.RegisterRequest(UUID(3, 4, 5, 6), MessageType::WRITE_REQ);
    }
    catch (const std::invalid_argument&)
    {
        threw = true;
    }

    ASSERT_TRUE(suite, threw);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestHandleCompletedResponse()
{
    INIT_SUITE(suite, "ResponseManager Completed Response");
    BEGIN_SUITE(suite);

    ResponseManager manager;
    const UUID request_id(4, 5, 6, 7);
    CallbackCapture capture;
    manager.RegisterRequest(request_id, MessageType::READ_RESP,
                            capture.Callback());

    const std::vector<std::uint8_t> payload = {'d', 'a', 't', 'a'};
    const ResponseManager::HandleResult result =
        manager.HandleResponse(MakeReadResponse(request_id, payload));
    const ResponseManager::Snapshot snapshot =
        manager.WaitForResponse(request_id, std::chrono::milliseconds(0));

    ASSERT_EQ(suite, static_cast<int>(ResponseManager::HandleResult::COMPLETED),
              static_cast<int>(result));
    ASSERT_EQ(suite, static_cast<int>(ResponseManager::State::COMPLETED),
              static_cast<int>(snapshot.state));
    ASSERT_TRUE(suite, snapshot.has_response);
    ASSERT_EQ(suite, payload.size(), snapshot.response.payload.size());
    ASSERT_EQ(suite, 0u, manager.PendingCount());
    ASSERT_EQ(suite, 1u, capture.count);
    ASSERT_EQ(suite, static_cast<int>(ResponseManager::State::COMPLETED),
              static_cast<int>(capture.completion.state));
    ASSERT_TRUE(suite, capture.completion.request_id == request_id);
    ASSERT_EQ(suite, payload.size(), capture.completion.payload.size());

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestHandleFailedStatus()
{
    INIT_SUITE(suite, "ResponseManager Failed Status");
    BEGIN_SUITE(suite);

    ResponseManager manager;
    const UUID request_id(5, 6, 7, 8);
    CallbackCapture capture;
    manager.RegisterRequest(request_id, MessageType::WRITE_RESP,
                            capture.Callback());

    const ResponseManager::HandleResult result =
        manager.HandleResponse(MakeWriteResponse(request_id,
                                                 StatusCode::OUT_OF_RANGE));
    const ResponseManager::Snapshot snapshot = manager.GetSnapshot(request_id);

    ASSERT_EQ(suite, static_cast<int>(ResponseManager::HandleResult::FAILED),
              static_cast<int>(result));
    ASSERT_EQ(suite, static_cast<int>(ResponseManager::State::FAILED),
              static_cast<int>(snapshot.state));
    ASSERT_TRUE(suite, snapshot.has_response);
    ASSERT_EQ(suite, static_cast<int>(StatusCode::OUT_OF_RANGE),
              static_cast<int>(snapshot.response.header.status_code));
    ASSERT_EQ(suite, 1u, capture.count);
    ASSERT_EQ(suite, static_cast<int>(ResponseManager::State::FAILED),
              static_cast<int>(capture.completion.state));

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestHandleUnexpectedResponseType()
{
    INIT_SUITE(suite, "ResponseManager Unexpected Response Type");
    BEGIN_SUITE(suite);

    ResponseManager manager;
    const UUID request_id(6, 7, 8, 9);
    CallbackCapture capture;
    manager.RegisterRequest(request_id, MessageType::READ_RESP,
                            capture.Callback());

    const ResponseManager::HandleResult result =
        manager.HandleResponse(MakeWriteResponse(request_id));
    const ResponseManager::Snapshot snapshot = manager.GetSnapshot(request_id);

    ASSERT_EQ(suite, static_cast<int>(ResponseManager::HandleResult::FAILED),
              static_cast<int>(result));
    ASSERT_EQ(suite, static_cast<int>(ResponseManager::State::FAILED),
              static_cast<int>(snapshot.state));
    ASSERT_TRUE(suite, snapshot.has_response);
    ASSERT_EQ(suite, static_cast<int>(MessageType::WRITE_RESP),
              static_cast<int>(snapshot.response.header.message_type));
    ASSERT_EQ(suite, 1u, capture.count);
    ASSERT_EQ(suite, static_cast<int>(ResponseManager::State::FAILED),
              static_cast<int>(capture.completion.state));

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestUnknownAndInvalidResponses()
{
    INIT_SUITE(suite, "ResponseManager Unknown Invalid Responses");
    BEGIN_SUITE(suite);

    ResponseManager manager;

    ASSERT_EQ(suite,
              static_cast<int>(ResponseManager::HandleResult::UNKNOWN_REQUEST),
              static_cast<int>(
                  manager.HandleResponse(MakeWriteResponse(UUID(7, 8, 9, 10)))));

    MessageV1 request;
    request.header.message_type = MessageType::FLUSH_REQ;
    request.header.request_id = UUID(8, 9, 10, 11);
    ASSERT_EQ(suite,
              static_cast<int>(ResponseManager::HandleResult::INVALID_RESPONSE),
              static_cast<int>(manager.HandleResponse(request)));
    ASSERT_EQ(suite, 0u, manager.PendingCount());

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestTimeout()
{
    INIT_SUITE(suite, "ResponseManager Timeout");
    BEGIN_SUITE(suite);

    ResponseManager manager;
    const UUID request_id(9, 10, 11, 12);
    CallbackCapture capture;
    manager.RegisterRequest(request_id, MessageType::WRITE_RESP,
                            capture.Callback());

    const ResponseManager::Snapshot snapshot =
        manager.WaitForResponse(request_id, std::chrono::milliseconds(10));

    ASSERT_EQ(suite, static_cast<int>(ResponseManager::State::TIMED_OUT),
              static_cast<int>(snapshot.state));
    ASSERT_FALSE(suite, snapshot.has_response);
    ASSERT_EQ(suite, 0u, manager.PendingCount());
    ASSERT_EQ(suite, 1u, capture.count);
    ASSERT_EQ(suite, static_cast<int>(ResponseManager::State::TIMED_OUT),
              static_cast<int>(capture.completion.state));
    ASSERT_EQ(suite, static_cast<int>(ResponseManager::HandleResult::FAILED),
              static_cast<int>(
                  manager.HandleResponse(MakeWriteResponse(request_id))));
    ASSERT_EQ(suite, 1u, capture.count);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestCallbackInvokedOnce()
{
    INIT_SUITE(suite, "ResponseManager Callback Once");
    BEGIN_SUITE(suite);

    ResponseManager manager;
    const UUID request_id(12, 13, 14, 15);
    CallbackCapture capture;
    manager.RegisterRequest(request_id, MessageType::WRITE_RESP,
                            capture.Callback());

    manager.HandleResponse(MakeWriteResponse(request_id));
    manager.HandleResponse(MakeWriteResponse(request_id));

    ASSERT_EQ(suite, 1u, capture.count);
    ASSERT_EQ(suite, static_cast<int>(ResponseManager::State::COMPLETED),
              static_cast<int>(capture.completion.state));

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestWaitUnblocksOnResponse()
{
    INIT_SUITE(suite, "ResponseManager Wait Unblocks");
    BEGIN_SUITE(suite);

    ResponseManager manager;
    const UUID request_id(10, 11, 12, 13);
    manager.RegisterRequest(request_id, MessageType::WRITE_RESP);

    std::thread responder(
        [&manager, request_id]()
        {
            std::this_thread::sleep_for(std::chrono::milliseconds(20));
            manager.HandleResponse(MakeWriteResponse(request_id));
        });

    const ResponseManager::Snapshot snapshot =
        manager.WaitForResponse(request_id, std::chrono::milliseconds(500));
    responder.join();

    ASSERT_EQ(suite, static_cast<int>(ResponseManager::State::COMPLETED),
              static_cast<int>(snapshot.state));
    ASSERT_TRUE(suite, snapshot.has_response);
    ASSERT_TRUE(suite, snapshot.response.header.request_id == request_id);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestRemoveRequest()
{
    INIT_SUITE(suite, "ResponseManager Remove Request");
    BEGIN_SUITE(suite);

    ResponseManager manager;
    const UUID request_id(11, 12, 13, 14);
    manager.RegisterRequest(request_id, MessageType::WRITE_RESP);

    ASSERT_TRUE(suite, manager.RemoveRequest(request_id));
    ASSERT_FALSE(suite, manager.RemoveRequest(request_id));
    ASSERT_EQ(suite,
              static_cast<int>(ResponseManager::HandleResult::UNKNOWN_REQUEST),
              static_cast<int>(
                  manager.HandleResponse(MakeWriteResponse(request_id))));

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

} // namespace

int main()
{
    PRINT_TEST_HEADER("ResponseManager");

    TestRegisterPendingRequest();
    TestRejectDuplicateRegistration();
    TestRejectNonResponseExpectedType();
    TestHandleCompletedResponse();
    TestHandleFailedStatus();
    TestHandleUnexpectedResponseType();
    TestUnknownAndInvalidResponses();
    TestTimeout();
    TestCallbackInvokedOnce();
    TestWaitUnblocksOnResponse();
    TestRemoveRequest();

    PRINT_SUMMARY();

    return 0;
}
