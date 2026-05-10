#include "runtime/MasterRuntime.hpp"

#include <algorithm>
#include <stdexcept>
#include <string>
#include <utility>

#include "DebugLogger.hpp"

namespace ilrd::concrete
{

namespace
{

MasterRuntime* g_activeRuntime = nullptr;

} // namespace

MasterRuntime::MasterRuntime(RAIDManager& raid_manager,
                             ResponseManager& response_manager,
                             CompletionCallback completion_callback,
                             RetryConfig retry_config)
    : m_raidManager(raid_manager),
      m_responseManager(response_manager),
      m_completionCallback(std::move(completion_callback)),
      m_retryConfig(retry_config)
{
    ILRD_DEBUG_LOG("MasterRuntime constructed");
}

RAIDManager& MasterRuntime::GetRAIDManager()
{
    return m_raidManager;
}

const RAIDManager& MasterRuntime::GetRAIDManager() const
{
    return m_raidManager;
}

ResponseManager& MasterRuntime::GetResponseManager()
{
    return m_responseManager;
}

const ResponseManager& MasterRuntime::GetResponseManager() const
{
    return m_responseManager;
}

const MasterRuntime::RetryConfig& MasterRuntime::GetRetryConfig() const
{
    return m_retryConfig;
}

void MasterRuntime::StartRequest(const UUID& request_id,
                                 wire::MessageType expected_response_type)
{
    std::lock_guard<std::mutex> lock(m_mutex);
    AggregatedRequest request;
    request.expected_response_type = expected_response_type;
    const bool inserted =
        m_requests.emplace(request_id, std::move(request)).second;
    if (!inserted)
    {
        throw std::invalid_argument("MasterRuntime request ID is already active");
    }

    ILRD_DEBUG_LOG("MasterRuntime started request " + request_id.ToString() +
                   " expected_type=" +
                   std::to_string(static_cast<int>(expected_response_type)));
}

void MasterRuntime::RegisterChildRequest(const UUID& parent_request_id,
                                         const UUID& child_request_id,
                                         wire::MessageType expected_response_type,
                                         std::uint64_t logical_offset,
                                         std::uint32_t expected_length,
                                         ResendAction resend_action)
{
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        std::map<UUID, AggregatedRequest>::iterator parent_iter =
            m_requests.find(parent_request_id);
        if (m_requests.end() == parent_iter)
        {
            throw std::out_of_range("MasterRuntime parent request is not active");
        }

        const bool inserted =
            parent_iter->second.child_request_ids.insert(child_request_id).second;
        if (!inserted)
        {
            throw std::invalid_argument("MasterRuntime child request ID already tracked");
        }

        ChildContext context;
        context.parent_request_id = parent_request_id;
        context.logical_offset = logical_offset;
        context.expected_length = expected_length;
        context.resend_action = std::move(resend_action);
        const bool child_inserted =
            m_childToParent.emplace(child_request_id, std::move(context)).second;
        if (!child_inserted)
        {
            parent_iter->second.child_request_ids.erase(child_request_id);
            throw std::invalid_argument("MasterRuntime child request context already tracked");
        }

        if (wire::MessageType::READ_RESP == expected_response_type)
        {
            ReadSegment segment;
            segment.logical_offset = logical_offset;
            segment.expected_length = expected_length;
            parent_iter->second.read_segments.emplace(child_request_id, segment);
        }
    }

    m_responseManager.RegisterRequest(
        child_request_id,
        expected_response_type,
        [this](const ResponseManager::ResponseCompletion& completion)
        {
            HandleChildCompletion(completion);
        });
    ILRD_DEBUG_LOG("MasterRuntime registered child request " +
                   child_request_id.ToString() + " parent=" +
                   parent_request_id.ToString());
}

bool MasterRuntime::HasActiveRequest(const UUID& request_id) const
{
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_requests.end() != m_requests.find(request_id);
}

bool MasterRuntime::HasPendingChildren(const UUID& request_id) const
{
    std::lock_guard<std::mutex> lock(m_mutex);
    std::map<UUID, AggregatedRequest>::const_iterator iter =
        m_requests.find(request_id);
    return m_requests.end() != iter && !iter->second.child_request_ids.empty();
}

bool MasterRuntime::RetransmitPendingChildren(const UUID& request_id)
{
    std::vector<ResendAction> resend_actions;
    std::vector<UUID> children_to_remove;
    wire::MessageType response_type = wire::MessageType::READ_RESP;
    bool should_fail = false;

    {
        std::lock_guard<std::mutex> lock(m_mutex);
        std::map<UUID, AggregatedRequest>::iterator parent_iter =
            m_requests.find(request_id);
        if (m_requests.end() == parent_iter)
        {
            return true;
        }

        response_type = parent_iter->second.expected_response_type;
        if (parent_iter->second.failed ||
            parent_iter->second.child_request_ids.empty())
        {
            return true;
        }

        for (const UUID& child_request_id : parent_iter->second.child_request_ids)
        {
            std::map<UUID, ChildContext>::iterator child_iter =
                m_childToParent.find(child_request_id);
            if (m_childToParent.end() == child_iter ||
                !child_iter->second.resend_action ||
                child_iter->second.retry_count >= m_retryConfig.max_retries)
            {
                should_fail = true;
                break;
            }

            ++child_iter->second.retry_count;
            resend_actions.push_back(child_iter->second.resend_action);
        }

        if (should_fail)
        {
            parent_iter->second.failed = true;
            parent_iter->second.failure_status = wire::StatusCode::UNAVAILABLE;
            children_to_remove.assign(parent_iter->second.child_request_ids.begin(),
                                      parent_iter->second.child_request_ids.end());
            for (const UUID& child_request_id : children_to_remove)
            {
                m_childToParent.erase(child_request_id);
            }
            m_requests.erase(parent_iter);
        }
    }

    if (should_fail)
    {
        for (const UUID& child_request_id : children_to_remove)
        {
            m_responseManager.RemoveRequest(child_request_id);
        }

        ILRD_DEBUG_LOG_LEVEL("MasterRuntime retry limit reached for request " +
                                 request_id.ToString(),
                             Logger::Level::WARNING);
        CompleteRequest(request_id, response_type, ResponseManager::State::FAILED,
                        wire::StatusCode::UNAVAILABLE);
        return true;
    }

    try
    {
        for (const ResendAction& resend_action : resend_actions)
        {
            resend_action();
        }
    }
    catch (const std::exception& error)
    {
        ILRD_DEBUG_LOG_LEVEL("MasterRuntime retransmit failed for request " +
                                 request_id.ToString() + ": " + error.what(),
                             Logger::Level::ERROR);
        AbortRequest(request_id, response_type, wire::StatusCode::UNAVAILABLE);
        return true;
    }

    ILRD_DEBUG_LOG("MasterRuntime retransmitted pending children for request " +
                   request_id.ToString() + " count=" +
                   std::to_string(resend_actions.size()));
    return false;
}

void MasterRuntime::MarkRequestDegraded(const UUID& request_id)
{
    std::lock_guard<std::mutex> lock(m_mutex);
    std::map<UUID, AggregatedRequest>::iterator iter = m_requests.find(request_id);
    if (m_requests.end() == iter)
    {
        throw std::out_of_range("MasterRuntime request ID is not active");
    }

    iter->second.degraded = true;
    ILRD_DEBUG_LOG_LEVEL("MasterRuntime marked request degraded " +
                             request_id.ToString(),
                         Logger::Level::WARNING);
}

void MasterRuntime::AbortRequest(const UUID& request_id,
                                 wire::MessageType expected_response_type,
                                 wire::StatusCode status)
{
    std::vector<UUID> child_request_ids;
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        std::map<UUID, AggregatedRequest>::iterator iter = m_requests.find(request_id);
        if (m_requests.end() == iter)
        {
            child_request_ids.clear();
        }
        else
        {
            child_request_ids.assign(iter->second.child_request_ids.begin(),
                                     iter->second.child_request_ids.end());
            for (const UUID& child_request_id : child_request_ids)
            {
                m_childToParent.erase(child_request_id);
            }
            m_requests.erase(iter);
        }
    }

    for (const UUID& child_request_id : child_request_ids)
    {
        m_responseManager.RemoveRequest(child_request_id);
    }

    ILRD_DEBUG_LOG_LEVEL("MasterRuntime aborting request " +
                             request_id.ToString(),
                         Logger::Level::WARNING);
    CompleteRequest(request_id, expected_response_type,
                    ResponseManager::State::FAILED, status);
}

void MasterRuntime::CompleteRequestIfReady(const UUID& request_id)
{
    AggregatedRequest snapshot;
    bool should_complete = false;
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        std::map<UUID, AggregatedRequest>::iterator iter = m_requests.find(request_id);
        if (m_requests.end() == iter)
        {
            return;
        }

        if (!iter->second.failed && !iter->second.child_request_ids.empty())
        {
            return;
        }

        snapshot = iter->second;
        m_requests.erase(iter);
        should_complete = true;
    }

    if (!should_complete)
    {
        return;
    }

    if (snapshot.failed)
    {
        CompleteRequest(request_id, snapshot.expected_response_type,
                        ResponseManager::State::FAILED,
                        snapshot.failure_status);
        return;
    }

    std::vector<std::uint8_t> payload;
    if (wire::MessageType::READ_RESP == snapshot.expected_response_type)
    {
        std::vector<std::pair<std::uint64_t, ReadSegment> > ordered_segments;
        for (const std::map<UUID, ReadSegment>::value_type& entry :
             snapshot.read_segments)
        {
            ordered_segments.push_back(std::make_pair(entry.second.logical_offset,
                                                      entry.second));
        }

        std::sort(ordered_segments.begin(), ordered_segments.end(),
                  [](const std::pair<std::uint64_t, ReadSegment>& lhs,
                     const std::pair<std::uint64_t, ReadSegment>& rhs)
                  {
                      return lhs.first < rhs.first;
                  });

        for (const std::pair<std::uint64_t, ReadSegment>& entry : ordered_segments)
        {
            payload.insert(payload.end(), entry.second.payload.begin(),
                           entry.second.payload.end());
        }
    }

    CompleteRequest(request_id,
                    snapshot.expected_response_type,
                    ResponseManager::State::COMPLETED,
                    snapshot.degraded ? wire::StatusCode::DEGRADED_OK
                                      : wire::StatusCode::OK,
                    payload);
}

void MasterRuntime::HandleChildCompletion(
    const ResponseManager::ResponseCompletion& completion)
{
    m_responseManager.RemoveRequest(completion.request_id);
    UUID parent_request_id;
    bool should_complete = false;

    {
        std::lock_guard<std::mutex> lock(m_mutex);
        std::map<UUID, ChildContext>::iterator child_iter =
            m_childToParent.find(completion.request_id);
        if (m_childToParent.end() == child_iter)
        {
            return;
        }

        parent_request_id = child_iter->second.parent_request_id;
        const std::uint64_t logical_offset = child_iter->second.logical_offset;
        const std::uint32_t expected_length = child_iter->second.expected_length;
        m_childToParent.erase(child_iter);

        std::map<UUID, AggregatedRequest>::iterator parent_iter =
            m_requests.find(parent_request_id);
        if (m_requests.end() == parent_iter)
        {
            return;
        }

        parent_iter->second.child_request_ids.erase(completion.request_id);
        if (ResponseManager::State::COMPLETED != completion.state)
        {
            parent_iter->second.failed = true;
            parent_iter->second.failure_status = completion.status;
        }
        else if (wire::MessageType::READ_RESP == parent_iter->second.expected_response_type)
        {
            std::map<UUID, ReadSegment>::iterator segment_iter =
                parent_iter->second.read_segments.find(completion.request_id);
            if (parent_iter->second.read_segments.end() == segment_iter ||
                completion.payload.size() != expected_length)
            {
                parent_iter->second.failed = true;
                parent_iter->second.failure_status = wire::StatusCode::IO_ERROR;
            }
            else
            {
                segment_iter->second.logical_offset = logical_offset;
                segment_iter->second.completed = true;
                segment_iter->second.payload = completion.payload;
            }
        }

        should_complete =
            parent_iter->second.failed || parent_iter->second.child_request_ids.empty();
    }

    ILRD_DEBUG_LOG("MasterRuntime handled child request " +
                   completion.request_id.ToString() + " parent=" +
                   parent_request_id.ToString() + " state=" +
                   std::to_string(static_cast<int>(completion.state)));

    if (should_complete)
    {
        CompleteRequestIfReady(parent_request_id);
    }
}

void MasterRuntime::CompleteRequest(const UUID& request_id,
                                    wire::MessageType response_type,
                                    ResponseManager::State state,
                                    wire::StatusCode status,
                                    const std::vector<std::uint8_t>& payload)
{
    ResponseManager::ResponseCompletion completion;
    completion.request_id = request_id;
    completion.state = state;
    completion.status = status;
    completion.payload = payload;
    completion.response_type = response_type;
    completion.response =
        MakeAggregatedResponse(request_id, response_type, status, payload);

    if (m_completionCallback)
    {
        m_completionCallback(completion);
    }
}

wire::MessageV1 MasterRuntime::MakeAggregatedResponse(
    const UUID& request_id,
    wire::MessageType response_type,
    wire::StatusCode status,
    const std::vector<std::uint8_t>& payload)
{
    wire::MessageV1 response;
    response.header.message_type = response_type;
    response.header.SetFlag(wire::FLAG_RESPONSE);
    response.header.request_id = request_id;
    response.header.status_code = status;
    response.header.operation_length =
        static_cast<std::uint32_t>(payload.size());
    response.header.payload_length =
        static_cast<std::uint32_t>(payload.size());
    response.header.SetFlag(wire::FLAG_HAS_PAYLOAD, !payload.empty());
    response.header.SetFlag(wire::FLAG_DEGRADED,
                            wire::StatusCode::DEGRADED_OK == status);
    response.payload = payload;
    return response;
}

void SetActiveMasterRuntime(MasterRuntime& runtime)
{
    g_activeRuntime = &runtime;
    ILRD_DEBUG_LOG("MasterRuntime activated");
}

void ClearActiveMasterRuntime()
{
    g_activeRuntime = nullptr;
    ILRD_DEBUG_LOG("MasterRuntime cleared");
}

MasterRuntime& GetActiveMasterRuntime()
{
    if (nullptr == g_activeRuntime)
    {
        throw std::logic_error("No active MasterRuntime installed");
    }

    return *g_activeRuntime;
}

} // namespace ilrd::concrete
