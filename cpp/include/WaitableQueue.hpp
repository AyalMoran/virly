
/**************************************************************
 * File    : WaitableQueue.hpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/
#ifndef _ILRD_WAITABLEQUEUE_HPP
#define _ILRD_WAITABLEQUEUE_HPP
#include <chrono>
#include <condition_variable>
#include <mutex>
#include <queue>

namespace ilrd
{
const int CACHELINE = 64;

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
template <typename T>
using WaitableQueueStoredType = CachelinePadded<T>;
#else
template <typename T>
using WaitableQueueStoredType = T;
#endif // PADDING

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
    WaitableQueue();

    void Push(const T& to_push);
    void Pop(T& out_param);
    bool Pop(std::chrono::milliseconds time_out_ms, T& out_param);

    // CODE_REVIEW: add documentation on the fragility of this bool's integrity
    // in a multithreaded application
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
    // CODE_REVIEW: use scope resolution
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
    // CODE_REVIEW: use unique_lock with constructor with now + time_out_ms
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
