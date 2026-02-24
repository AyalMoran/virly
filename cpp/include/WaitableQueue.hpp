
/**************************************************************
 * File    : WaitableQueue.hpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/
#ifndef _ILRD_WAITABLEQUEUE_HPP
#define _ILRD_WAITABLEQUEUE_HPP
#include <queue>
#include <chrono>

/*Declarations for WaitableQueue*/
namespace ilrd
{
template <typename T, class CONTAINER = std::queue<T> > class WaitableQueue
{
  private:
    CONTAINER m_q;

  public:
    WaitableQueue();
     
    void Pop(T& out_param);
    bool Pop(std::chrono::duration time_out_ms, T& out_param);

    bool IsEmpty(); // חסר משמעות לכאורה
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