
/**************************************************************
 * File    : WaitableQueue.hpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/
#ifndef _ILRD_WAITABLEQUEUE_HPP
#define _ILRD_WAITABLEQUEUE_HPP
#include <chrono>
#include <queue>
#include <mutex>
#include <condition_variable>

/*Declarations for WaitableQueue*/
namespace ilrd
{
template <typename T, class CONTAINER = std::queue<T>> class WaitableQueue
{
  private:
    std::mutex m_mutex;
    std::condition_variable m_cond_var;
    CONTAINER m_q;

  public:
    WaitableQueue();

    void Push(const T& to_push);
    void Pop(T& out_param);
    bool Pop(std::size_t time_out_ms, T& out_param);
    bool IsEmpty();
};
template <typename T, class CONTAINER>
WaitableQueue<T, CONTAINER>::WaitableQueue() : m_mutex(), m_cond_var(), m_q()
{

}

template <typename T, class CONTAINER> 
void WaitableQueue<T, CONTAINER>::Push(const T& to_push)
{
    std::unique_lock<std::mutex> lock(m_mutex);
    m_q.push(to_push);
    m_cond_var.notify_one();
}
template <typename T, class CONTAINER>
void WaitableQueue<T, CONTAINER>::Pop(T& out_param)
{
  std::unique_lock<std::mutex> lock(m_mutex);
  m_cond_var.wait(lock, [this]() { return !(this->m_q.empty()); });
    out_param = m_q.front();
    m_q.pop();
    return;
}

template <typename T, class CONTAINER>
bool WaitableQueue<T, CONTAINER>::Pop(std::size_t time_out_ms, T& out_param)
{
    std::unique_lock<std::mutex> lock(m_mutex);
    if (m_cond_var.wait_for(lock, std::chrono::milliseconds(time_out_ms), [this]() { return !m_q.empty(); }))
    {
        out_param = m_q.front();
        m_q.pop();
        return true;
    }
    return false;
}

template <typename T, class CONTAINER>
bool WaitableQueue<T, CONTAINER>::IsEmpty()
{
    std::unique_lock<std::mutex> lock(m_mutex);
    return m_q.empty();
}

} // namespace ilrd
#endif /* _ILRD_WAITABLEQUEUE_HPP */

/*

template<T,CONTAINER=std::queue>
class WaitableQueue
{
public:
    Push
    void Pop(T& out_param)
    bool Pop(time_out_ms,T& out_param)

    bool IsEmpty();//חסר משמעות לכאורה

private:
    CONTAINER m_q;
};

template<T,PQ_CONTAINER=std::vector,COMPARE_FUNC=std::less>
class PriorityQueue : private std::priority_queue<T,PQ_CONTAINER,COMPARE_FUNC>
{
public:
    // API like std::queue
    pop
    push
    front(){parent::top();}
    IsEmpty
};


*/
