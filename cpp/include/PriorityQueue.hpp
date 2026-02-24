/**************************************************************
 * File    : GenericWaitableQueue.hpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/
#ifndef _ILRD_GENERICWAITABLEQUEUE_HPP
#define _ILRD_GENERICWAITABLEQUEUE_HPP

#include <vector>
#include <priority_queue.hpp>
namespace ilrd
{

template <typename T, class PQ_CONTAINER = std::vector<T>, class COMPARE_FUNC = std::less>
class PriorityQueue : private std::priority_queue<T, PQ_CONTAINER, COMPARE_FUNC>
{
  public:
    // API like std::queue
    pop push front()
    {
        parent::top();
    }
    IsEmpty
};
} // namespace ilrd
#endif /* _ILRD_GENERICWAITABLEQUEUE_HPP */
