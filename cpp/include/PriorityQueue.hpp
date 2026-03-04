/**************************************************************
 * File    : PriorityQueue.hpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/
#ifndef _ILRD_PRIORITYQUEUE_HPP
#define _ILRD_PRIORITYQUEUE_HPP

#include <cstddef>
#include <functional>
#include <queue>
#include <utility>
#include <vector>

namespace ilrd
{
template <typename T, class PQ_CONTAINER = std::vector<T>,
          class COMPARE_FUNC = std::less<T>>
class PriorityQueue : private std::priority_queue<T, PQ_CONTAINER, COMPARE_FUNC>
{
  private:
    using Base = std::priority_queue<T, PQ_CONTAINER, COMPARE_FUNC>;

  public:
    PriorityQueue();

    void push(const T& value);
    void push(T&& value);
    void pop();

    const T& front();
    const T& front() const;

    bool empty() const;
    std::size_t size() const;
};


template <typename T, class PQ_CONTAINER, class COMPARE_FUNC>
PriorityQueue<T, PQ_CONTAINER, COMPARE_FUNC>::PriorityQueue()
    : Base()
{
}

template <typename T, class PQ_CONTAINER, class COMPARE_FUNC>
void PriorityQueue<T, PQ_CONTAINER, COMPARE_FUNC>::push(const T& value)
{
    Base::push(value);
}

template <typename T, class PQ_CONTAINER, class COMPARE_FUNC>
void PriorityQueue<T, PQ_CONTAINER, COMPARE_FUNC>::push(T&& value)
{
    Base::push(std::move(value));
}

template <typename T, class PQ_CONTAINER, class COMPARE_FUNC>
void PriorityQueue<T, PQ_CONTAINER, COMPARE_FUNC>::pop()
{
    Base::pop();
}

template <typename T, class PQ_CONTAINER, class COMPARE_FUNC>
const T& PriorityQueue<T, PQ_CONTAINER, COMPARE_FUNC>::front()
{
    return Base::top();
}

template <typename T, class PQ_CONTAINER, class COMPARE_FUNC>
const T& PriorityQueue<T, PQ_CONTAINER, COMPARE_FUNC>::front() const
{
    return Base::top();
}

template <typename T, class PQ_CONTAINER, class COMPARE_FUNC>
bool PriorityQueue<T, PQ_CONTAINER, COMPARE_FUNC>::empty() const
{
    return Base::empty();
}

template <typename T, class PQ_CONTAINER, class COMPARE_FUNC>
std::size_t PriorityQueue<T, PQ_CONTAINER, COMPARE_FUNC>::size() const
{
    return Base::size();
}

} // namespace ilrd

#endif /* _ILRD_PRIORITYQUEUE_HPP */
