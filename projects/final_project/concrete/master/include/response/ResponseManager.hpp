/**
 * @file ResponseManager.hpp
 * @brief Declares response tracking and completion notification utilities.
 */
#ifndef ILRD_CONCRETE_RESPONSE_MANAGER_HPP
#define ILRD_CONCRETE_RESPONSE_MANAGER_HPP

#include <chrono>
#include <condition_variable>
#include <cstddef>
#include <functional>
#include <map>
#include <memory>
#include <mutex>

#include "identity/UUID.hpp"
#include "wire/WireProtocol.hpp"

namespace ilrd::concrete
{

/**
 * @brief Tracks outstanding requests and matches incoming responses by UUID.
 *
 * Methods on this class are synchronized internally and may be called from
 * transport, command, and orchestration threads.
 */
class ResponseManager
{
  public:
    /**
     * @brief Lifecycle states for a tracked request.
     */
    enum class State
    {
        PENDING,
        COMPLETED,
        FAILED,
        TIMED_OUT
    };

    /**
     * @brief Result of attempting to handle an incoming response.
     */
    enum class HandleResult
    {
        COMPLETED,
        FAILED,
        UNKNOWN_REQUEST,
        INVALID_RESPONSE
    };

    /**
     * @brief Snapshot of a tracked request's current visible state.
     */
    struct Snapshot
    {
        State state = State::PENDING;
        bool has_response = false;
        wire::MessageV1 response = {};
    };

    /**
     * @brief Completion payload passed to registered callbacks.
     */
    struct ResponseCompletion
    {
        UUID request_id = UUID(0, 0, 0, 0);
        State state = State::PENDING;
        wire::StatusCode status = wire::StatusCode::OK;
        wire::MessageType response_type = wire::MessageType::READ_RESP;
        std::vector<std::uint8_t> payload = {};
        wire::MessageV1 response = {};
    };

    /**
     * @brief Callback invoked exactly once when a request reaches a terminal state.
     */
    using CompletionCallback =
        std::function<void(const ResponseCompletion& completion)>;

    ResponseManager() = default;

    ResponseManager(const ResponseManager&) = delete;
    ResponseManager& operator=(const ResponseManager&) = delete;

    void RegisterRequest(const UUID& request_id,
                         wire::MessageType expected_response_type);
    void RegisterRequest(const UUID& request_id,
                         wire::MessageType expected_response_type,
                         CompletionCallback completion_callback);
    HandleResult HandleResponse(const wire::MessageV1& response);
    Snapshot WaitForResponse(const UUID& request_id,
                             std::chrono::milliseconds timeout);
    Snapshot GetSnapshot(const UUID& request_id) const;
    bool RemoveRequest(const UUID& request_id);
    std::size_t PendingCount() const;

  private:
    struct Entry
    {
        Entry(wire::MessageType expected_type,
              CompletionCallback completion_callback);

        wire::MessageType expected_response_type;
        State state;
        bool has_response;
        wire::MessageV1 response;
        CompletionCallback completion_callback;
        bool callback_invoked;
        std::condition_variable condition;
    };

    using EntryPtr = std::shared_ptr<Entry>;
    using RequestMap = std::map<UUID, EntryPtr>;

    static State StateForStatus(wire::StatusCode status);
    static HandleResult ResultForState(State state);
    static Snapshot MakeSnapshot(const Entry& entry);
    static ResponseCompletion MakeCompletion(const UUID& request_id,
                                             const Entry& entry);
    static bool IsTerminal(State state);

    mutable std::mutex m_mutex;
    RequestMap m_requests;
};

} // namespace ilrd::concrete

#endif // ILRD_CONCRETE_RESPONSE_MANAGER_HPP
