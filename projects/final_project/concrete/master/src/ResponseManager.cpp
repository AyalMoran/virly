#include "response/ResponseManager.hpp"

#include <algorithm>
#include <stdexcept>
#include <string>
#include <utility>

#include "DebugLogger.hpp"

namespace ilrd::concrete
{

ResponseManager::Entry::Entry(wire::MessageType expected_type,
                              CompletionCallback completion_callback)
    : expected_response_type(expected_type),
      state(State::PENDING),
      has_response(false),
      response(),
      completion_callback(std::move(completion_callback)),
      callback_invoked(false),
      condition()
{
}

void ResponseManager::RegisterRequest(
    const UUID& request_id, wire::MessageType expected_response_type)
{
    RegisterRequest(request_id, expected_response_type, CompletionCallback());
}

void ResponseManager::RegisterRequest(
    const UUID& request_id,
    wire::MessageType expected_response_type,
    CompletionCallback completion_callback)
{
    if (!wire::IsResponseType(expected_response_type))
    {
        throw std::invalid_argument(
            "ResponseManager expected type must be a response type");
    }

    std::lock_guard<std::mutex> lock(m_mutex);
    const bool inserted =
        m_requests.emplace(request_id,
                           EntryPtr(new Entry(expected_response_type,
                                              std::move(completion_callback))))
            .second;
    if (!inserted)
    {
        throw std::invalid_argument(
            "ResponseManager request ID is already registered");
    }

    ILRD_DEBUG_LOG("ResponseManager registered request " +
                   request_id.ToString() + " expected_type=" +
                   std::to_string(static_cast<int>(expected_response_type)));
}

ResponseManager::HandleResult ResponseManager::HandleResponse(
    const wire::MessageV1& response)
{
    if (!wire::IsResponseType(response.header.message_type))
    {
        ILRD_DEBUG_LOG_LEVEL("ResponseManager rejected invalid response type",
                             Logger::Level::WARNING);
        return HandleResult::INVALID_RESPONSE;
    }

    EntryPtr entry;
    State final_state = State::PENDING;
    CompletionCallback callback;
    ResponseCompletion completion;
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        RequestMap::iterator iter = m_requests.find(response.header.request_id);
        if (m_requests.end() == iter)
        {
            ILRD_DEBUG_LOG_LEVEL("ResponseManager received unknown request " +
                                     response.header.request_id.ToString(),
                                 Logger::Level::WARNING);
            return HandleResult::UNKNOWN_REQUEST;
        }

        entry = iter->second;
        if (State::PENDING != entry->state)
        {
            ILRD_DEBUG_LOG_LEVEL("ResponseManager received duplicate terminal response for " +
                                     response.header.request_id.ToString(),
                                 Logger::Level::WARNING);
            return ResultForState(entry->state);
        }

        entry->response = response;
        entry->has_response = true;

        if (response.header.message_type != entry->expected_response_type)
        {
            entry->state = State::FAILED;
        }
        else
        {
            entry->state = StateForStatus(response.header.status_code);
        }

        final_state = entry->state;
        if (IsTerminal(final_state) && entry->completion_callback &&
            !entry->callback_invoked)
        {
            entry->callback_invoked = true;
            callback = entry->completion_callback;
            completion = MakeCompletion(response.header.request_id, *entry);
        }
    }

    entry->condition.notify_all();
    if (callback)
    {
        callback(completion);
    }

    ILRD_DEBUG_LOG("ResponseManager handled response for " +
                   response.header.request_id.ToString() + " state=" +
                   std::to_string(static_cast<int>(final_state)) +
                   " status=" +
                   std::to_string(static_cast<int>(response.header.status_code)));

    return ResultForState(final_state);
}

ResponseManager::Snapshot ResponseManager::WaitForResponse(
    const UUID& request_id, std::chrono::milliseconds timeout)
{
    EntryPtr entry;
    std::unique_lock<std::mutex> lock(m_mutex);

    RequestMap::iterator iter = m_requests.find(request_id);
    if (m_requests.end() == iter)
    {
        throw std::out_of_range("ResponseManager request ID is not registered");
    }

    entry = iter->second;
    if (State::PENDING == entry->state)
    {
        if (timeout < std::chrono::milliseconds::zero())
        {
            entry->condition.wait(lock,
                                  [&entry]()
                                  { return State::PENDING != entry->state; });
        }
        else if (!entry->condition.wait_for(
                     lock, timeout,
                     [&entry]()
                     { return State::PENDING != entry->state; }))
        {
            entry->state = State::TIMED_OUT;
            ILRD_DEBUG_LOG_LEVEL("ResponseManager timed out request " +
                                     request_id.ToString(),
                                 Logger::Level::WARNING);
        }
    }

    CompletionCallback callback;
    ResponseCompletion completion;
    if (IsTerminal(entry->state) && entry->completion_callback &&
        !entry->callback_invoked)
    {
        entry->callback_invoked = true;
        callback = entry->completion_callback;
        completion = MakeCompletion(request_id, *entry);
    }

    Snapshot snapshot = MakeSnapshot(*entry);
    lock.unlock();

    entry->condition.notify_all();
    if (callback)
    {
        callback(completion);
    }

    return snapshot;
}

ResponseManager::Snapshot ResponseManager::GetSnapshot(
    const UUID& request_id) const
{
    std::lock_guard<std::mutex> lock(m_mutex);

    RequestMap::const_iterator iter = m_requests.find(request_id);
    if (m_requests.end() == iter)
    {
        throw std::out_of_range("ResponseManager request ID is not registered");
    }

    return MakeSnapshot(*iter->second);
}

bool ResponseManager::RemoveRequest(const UUID& request_id)
{
    std::lock_guard<std::mutex> lock(m_mutex);
    const bool removed = 0 != m_requests.erase(request_id);
    ILRD_DEBUG_LOG("ResponseManager remove request " + request_id.ToString() +
                   " removed=" + std::to_string(static_cast<int>(removed)));
    return removed;
}

std::size_t ResponseManager::PendingCount() const
{
    std::lock_guard<std::mutex> lock(m_mutex);
    return static_cast<std::size_t>(
        std::count_if(m_requests.begin(), m_requests.end(),
                      [](const RequestMap::value_type& request)
                      {
                          return State::PENDING == request.second->state;
                      }));
}

ResponseManager::State ResponseManager::StateForStatus(wire::StatusCode status)
{
    if (wire::StatusCode::OK == status ||
        wire::StatusCode::DEGRADED_OK == status)
    {
        return State::COMPLETED;
    }

    return State::FAILED;
}

ResponseManager::HandleResult ResponseManager::ResultForState(State state)
{
    switch (state)
    {
    case State::COMPLETED:
        return HandleResult::COMPLETED;
    case State::FAILED:
    case State::TIMED_OUT:
        return HandleResult::FAILED;
    case State::PENDING:
        break;
    }

    return HandleResult::INVALID_RESPONSE;
}

ResponseManager::Snapshot ResponseManager::MakeSnapshot(const Entry& entry)
{
    Snapshot snapshot;
    snapshot.state = entry.state;
    snapshot.has_response = entry.has_response;
    snapshot.response = entry.response;
    return snapshot;
}

ResponseManager::ResponseCompletion ResponseManager::MakeCompletion(
    const UUID& request_id, const Entry& entry)
{
    ResponseCompletion completion;
    completion.request_id = request_id;
    completion.state = entry.state;
    completion.response = entry.response;
    completion.payload = entry.response.payload;

    if (entry.has_response)
    {
        completion.status = entry.response.header.status_code;
        completion.response_type = entry.response.header.message_type;
    }
    else
    {
        completion.status = wire::StatusCode::UNAVAILABLE;
        completion.response_type = entry.expected_response_type;
    }

    return completion;
}

bool ResponseManager::IsTerminal(State state)
{
    return State::COMPLETED == state ||
           State::FAILED == state ||
           State::TIMED_OUT == state;
}

} // namespace ilrd::concrete
