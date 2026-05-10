/**************************************************************
 * File    : WaitableQueue.hpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/
/**
 * @file WaitableQueue.hpp
 * @brief Defines a blocking queue with optional timeout support.
 */
#ifndef _ILRD_WAITABLEQUEUE_HPP
#define _ILRD_WAITABLEQUEUE_HPP

#include <chrono>
#include <condition_variable>
#include <mutex>
#include <queue>

namespace ilrd
{

/**
 * @brief Cache-line size used by the optional padding mode.
 */
const int CACHELINE = 64;

/**
 * @brief Wraps values so they can be padded to a full cache line.
 * @tparam T Stored value type.
 */
template <typename T>
struct alignas(CACHELINE) CachelinePadded
{
    CachelinePadded() = default;
    CachelinePadded(const T& value) : data(value) {}

    operator T&()
    {
        return data;
    }

    operator const T&() const
    {
        return data;
    }

    T data;
};

#ifdef PADDING
/**
 * @brief Selects the padded storage type when cache-line padding is enabled.
 */
template <typename T>
using WaitableQueueStoredType = CachelinePadded<T>;
#else
/**
 * @brief Selects the unpadded storage type when padding is disabled.
 */
template <typename T>
using WaitableQueueStoredType = T;
#endif // PADDING

/**
 * @brief Thread-safe blocking queue abstraction.
 * @tparam T Logical value type exposed to callers.
 * @tparam CONTAINER Underlying queue-like container type.
 */
template <typename T, class CONTAINER = std::queue<WaitableQueueStoredType<T>>>
class WaitableQueue
{
  private:
    using stored_type = WaitableQueueStoredType<T>;

    static stored_type Wrap(const T& to_push)
    {
        return stored_type{to_push};
    }

    static const T& Unwrap(const T& value)
    {
        return value;
    }

    static const T& Unwrap(const CachelinePadded<T>& value)
    {
        return value.data;
    }

  public:
    /**
     * @brief Creates an empty waitable queue.
     */
    WaitableQueue();

    /**
     * @brief Pushes a value and wakes one waiting consumer.
     * @param to_push Value to enqueue.
     */
    void Push(const T& to_push);

    /**
     * @brief Pops the next value, blocking until one is available.
     * @param out_param Receives the dequeued value.
     */
    void Pop(T& out_param);

    /**
     * @brief Attempts to pop a value before the timeout expires.
     * @param time_out_ms Maximum time to wait.
     * @param out_param Receives the dequeued value on success.
     * @return `true` if a value was dequeued before timeout.
     */
    bool Pop(std::chrono::milliseconds time_out_ms, T& out_param);

    /**
     * @brief Checks whether the queue is currently empty.
     * @return `true` if no items are queued.
     */
    bool IsEmpty();

  private:
    std::timed_mutex m_mutex;
#ifdef PADDING
    char padding1[CACHELINE];
#endif // PADDING
    std::condition_variable_any m_cond_var;
#ifdef PADDING
    char padding2[CACHELINE];
#endif // PADDING
    CONTAINER m_q;
};

template <typename T, class CONTAINER>
WaitableQueue<T, CONTAINER>::WaitableQueue() : m_mutex(), m_cond_var(), m_q()
{
}

template <typename T, class CONTAINER>
void WaitableQueue<T, CONTAINER>::Push(const T& to_push)
{
    {
        std::unique_lock<std::timed_mutex> lock(m_mutex);
        m_q.push(Wrap(to_push));
    }
    m_cond_var.notify_one();
}

template <typename T, class CONTAINER>
void WaitableQueue<T, CONTAINER>::Pop(T& out_param)
{
    std::unique_lock<std::timed_mutex> lock(m_mutex);

    m_cond_var.wait(lock, [this]() { return !(this->m_q.empty()); });
    out_param = Unwrap(m_q.front());

    m_q.pop();
    return;
}

template <typename T, class CONTAINER>
bool WaitableQueue<T, CONTAINER>::Pop(std::chrono::milliseconds time_out_ms,
                                      T& out_param)
{
    std::chrono::time_point timeout_point =
        std::chrono::steady_clock::now() + time_out_ms;
    std::unique_lock<std::timed_mutex> lock(m_mutex, timeout_point);
    if (!lock.owns_lock())
    {
        return false;
    }

    if (m_cond_var.wait_until(lock, timeout_point,
                              [this]() { return !m_q.empty(); }))
    {
        out_param = Unwrap(m_q.front());
        m_q.pop();
        return true;
    }
    return false;
}

template <typename T, class CONTAINER>
bool WaitableQueue<T, CONTAINER>::IsEmpty()
{
    std::unique_lock<std::timed_mutex> lock(m_mutex);
    return m_q.empty();
}

} // namespace ilrd

#endif /* _ILRD_WAITABLEQUEUE_HPP */
