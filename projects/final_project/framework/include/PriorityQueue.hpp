/**************************************************************
 * File    : PriorityQueue.hpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/
/**
 * @file PriorityQueue.hpp
 * @brief Defines a small wrapper around `std::priority_queue`.
 */
#ifndef _ILRD_PRIORITYQUEUE_HPP
#define _ILRD_PRIORITYQUEUE_HPP

#include <cstddef>
#include <functional>
#include <queue>
#include <utility>
#include <vector>

namespace ilrd
{

/**
 * @brief Priority queue adapter exposing `front()` instead of `top()`.
 * @tparam T Stored value type.
 * @tparam PQ_CONTAINER Underlying container type.
 * @tparam COMPARE_FUNC Comparator used to prioritize elements.
 */
template <typename T, class PQ_CONTAINER = std::vector<T>,
          class COMPARE_FUNC = std::less<T>>
class PriorityQueue : private std::priority_queue<T, PQ_CONTAINER, COMPARE_FUNC>
{
  private:
    using Base = std::priority_queue<T, PQ_CONTAINER, COMPARE_FUNC>;

  public:
    /**
     * @brief Creates an empty priority queue.
     */
    inline PriorityQueue();

    /**
     * @brief Inserts a copy of `value`.
     * @param value Value to enqueue.
     */
    inline void push(const T& value);

    /**
     * @brief Moves `value` into the queue.
     * @param value Value to enqueue.
     */
    inline void push(T&& value);

    /**
     * @brief Removes the current highest-priority element.
     */
    inline void pop();

    /**
     * @brief Returns the current highest-priority element.
     * @return Reference to the front element.
     */
    inline const T& front();

    /**
     * @brief Returns the current highest-priority element.
     * @return Const reference to the front element.
     */
    inline const T& front() const;

    /**
     * @brief Checks whether the queue is empty.
     * @return `true` if no elements are stored.
     */
    inline bool empty() const;

    /**
     * @brief Returns the number of stored elements.
     * @return Queue size.
     */
    inline std::size_t size() const;
};

template <typename T, class PQ_CONTAINER, class COMPARE_FUNC>
inline PriorityQueue<T, PQ_CONTAINER, COMPARE_FUNC>::PriorityQueue()
    : Base()
{
}

template <typename T, class PQ_CONTAINER, class COMPARE_FUNC>
inline void PriorityQueue<T, PQ_CONTAINER, COMPARE_FUNC>::push(const T& value)
{
    Base::push(value);
}

template <typename T, class PQ_CONTAINER, class COMPARE_FUNC>
inline void PriorityQueue<T, PQ_CONTAINER, COMPARE_FUNC>::push(T&& value)
{
    Base::push(std::move(value));
}

template <typename T, class PQ_CONTAINER, class COMPARE_FUNC>
inline void PriorityQueue<T, PQ_CONTAINER, COMPARE_FUNC>::pop()
{
    Base::pop();
}

template <typename T, class PQ_CONTAINER, class COMPARE_FUNC>
inline const T& PriorityQueue<T, PQ_CONTAINER, COMPARE_FUNC>::front()
{
    return Base::top();
}

template <typename T, class PQ_CONTAINER, class COMPARE_FUNC>
inline const T& PriorityQueue<T, PQ_CONTAINER, COMPARE_FUNC>::front() const
{
    return Base::top();
}

template <typename T, class PQ_CONTAINER, class COMPARE_FUNC>
inline bool PriorityQueue<T, PQ_CONTAINER, COMPARE_FUNC>::empty() const
{
    return Base::empty();
}

template <typename T, class PQ_CONTAINER, class COMPARE_FUNC>
inline std::size_t PriorityQueue<T, PQ_CONTAINER, COMPARE_FUNC>::size() const
{
    return Base::size();
}

} // namespace ilrd

#endif /* _ILRD_PRIORITYQUEUE_HPP */
