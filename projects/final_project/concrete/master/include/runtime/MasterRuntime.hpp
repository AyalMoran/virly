/**
 * @file MasterRuntime.hpp
 * @brief Declares runtime state used while aggregating master-side requests.
 */
#ifndef ILRD_CONCRETE_MASTER_RUNTIME_HPP
#define ILRD_CONCRETE_MASTER_RUNTIME_HPP

#include <chrono>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <map>
#include <mutex>
#include <set>
#include <vector>

#include "placement/RAIDManager.hpp"
#include "response/ResponseManager.hpp"

namespace ilrd::concrete
{

/**
 * @brief Coordinates multi-minion request fan-out and aggregation on the master.
 */
class MasterRuntime
{
  public:
    using CompletionCallback = ResponseManager::CompletionCallback;
    using ResendAction = std::function<void()>;

    struct RetryConfig
    {
        explicit RetryConfig(
            std::size_t max_retries_ = 10,
            std::chrono::milliseconds interval_ =
                std::chrono::milliseconds(100))
            : max_retries(max_retries_),
              interval(interval_)
        {
        }

        std::size_t max_retries;
        std::chrono::milliseconds interval;
    };

    /**
     * @brief Creates a runtime bound to placement and response services.
     * @param raid_manager Placement service used to resolve minion targets.
     * @param response_manager Request tracker used for child responses.
     * @param completion_callback Optional callback for completed parent requests.
     * @param retry_config Policy for retransmitting unanswered child requests.
     */
    MasterRuntime(RAIDManager& raid_manager,
                  ResponseManager& response_manager,
                  CompletionCallback completion_callback = CompletionCallback(),
                  RetryConfig retry_config = RetryConfig());

    RAIDManager& GetRAIDManager();
    const RAIDManager& GetRAIDManager() const;
    ResponseManager& GetResponseManager();
    const ResponseManager& GetResponseManager() const;
    const RetryConfig& GetRetryConfig() const;

    void StartRequest(const UUID& request_id,
                      wire::MessageType expected_response_type);
    void RegisterChildRequest(const UUID& parent_request_id,
                              const UUID& child_request_id,
                              wire::MessageType expected_response_type,
                              std::uint64_t logical_offset = 0,
                              std::uint32_t expected_length = 0,
                              ResendAction resend_action = ResendAction());
    bool HasActiveRequest(const UUID& request_id) const;
    bool HasPendingChildren(const UUID& request_id) const;
    bool RetransmitPendingChildren(const UUID& request_id);
    void MarkRequestDegraded(const UUID& request_id);
    void AbortRequest(const UUID& request_id,
                      wire::MessageType expected_response_type,
                      wire::StatusCode status = wire::StatusCode::UNAVAILABLE);
    void CompleteRequestIfReady(const UUID& request_id);

  private:
    struct ReadSegment
    {
        std::uint64_t logical_offset = 0;
        std::uint32_t expected_length = 0;
        bool completed = false;
        std::vector<std::uint8_t> payload;
    };

    struct AggregatedRequest
    {
        wire::MessageType expected_response_type = wire::MessageType::READ_RESP;
        std::set<UUID> child_request_ids;
        std::map<UUID, ReadSegment> read_segments;
        bool degraded = false;
        bool failed = false;
        wire::StatusCode failure_status = wire::StatusCode::UNAVAILABLE;
    };

    struct ChildContext
    {
        UUID parent_request_id = UUID(0, 0, 0, 0);
        std::uint64_t logical_offset = 0;
        std::uint32_t expected_length = 0;
        ResendAction resend_action;
        std::size_t retry_count = 0;
    };

    void HandleChildCompletion(
        const ResponseManager::ResponseCompletion& completion);
    void CompleteRequest(const UUID& request_id,
                         wire::MessageType response_type,
                         ResponseManager::State state,
                         wire::StatusCode status,
                         const std::vector<std::uint8_t>& payload = {});
    static wire::MessageV1 MakeAggregatedResponse(
        const UUID& request_id,
        wire::MessageType response_type,
        wire::StatusCode status,
        const std::vector<std::uint8_t>& payload);

    RAIDManager& m_raidManager;
    ResponseManager& m_responseManager;
    CompletionCallback m_completionCallback;
    RetryConfig m_retryConfig;
    mutable std::mutex m_mutex;
    std::map<UUID, AggregatedRequest> m_requests;
    std::map<UUID, ChildContext> m_childToParent;
};

/**
 * @brief Sets the thread-global active master runtime.
 * @param runtime Runtime instance that subsequent helpers should use.
 */
void SetActiveMasterRuntime(MasterRuntime& runtime);

/**
 * @brief Clears the active master runtime pointer.
 */
void ClearActiveMasterRuntime();

/**
 * @brief Returns the active master runtime.
 * @return Active runtime reference.
 *
 * Caller must ensure an active runtime was previously installed.
 */
MasterRuntime& GetActiveMasterRuntime();

} // namespace ilrd::concrete

#endif // ILRD_CONCRETE_MASTER_RUNTIME_HPP
