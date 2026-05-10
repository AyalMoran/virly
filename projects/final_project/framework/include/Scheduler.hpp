/**************************************************************
 * File    : Scheduler.hpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/
/**
 * @file Scheduler.hpp
 * @brief Declares the singleton timer-based task scheduler.
 */
#ifndef ILRD_SCHEDULER_HPP
#define ILRD_SCHEDULER_HPP

#include <chrono>   // std::chrono::*
#include <cstdint>  // uint64_t
#include <mutex>    // std::mutex
#include <signal.h> // sigval
#include <vector>   // std::vector

#include "PriorityQueue.hpp" // PriorityQueue
#include "SharedPtr.hpp"     // SharedPtr
#include "Singleton.hpp"     // Singleton
#include "WaitableQueue.hpp" // WaitableQueue

namespace ilrd
{

/**
 * @brief Schedules one-shot tasks for future execution.
 *
 * Scheduler is exposed as a singleton because timer signal routing is process
 * global in the current design.
 */
class Scheduler
{
  public:
    /**
     * @brief Base interface for scheduled work items.
     */
    class ISchedulerTask
    {
      public:
        virtual ~ISchedulerTask() = default;

        /**
         * @brief Executes the scheduled work.
         */
        virtual void Execute() = 0;
    };

    /**
     * @brief Returns the singleton scheduler instance.
     * @return Shared scheduler singleton.
     */
    static Scheduler* GetInstance();

    /**
     * @brief Schedules a task to run after a delay.
     * @param task Scheduled task instance.
     * @param dt_msec Delay before execution.
     */
    void AddTask(SharedPtr<ISchedulerTask> task,
                 std::chrono::milliseconds dt_msec);

  private:
    /**
     * @brief Internal queue entry used to order tasks by execution time.
     */
    struct SchedulerTaskWrapper
    {
        SharedPtr<ISchedulerTask> m_schedulerTask;
        std::chrono::steady_clock::time_point m_executionTime;
        uint64_t m_seq;

        SchedulerTaskWrapper& operator=(const SharedPtr<ISchedulerTask>& other)
        {
            m_schedulerTask = other;
            return *this;
        }
    };

    /**
     * @brief Comparator that orders tasks by execution time and insertion order.
     */
    struct SchedulerTaskCompare
    {
        bool operator()(const SharedPtr<SchedulerTaskWrapper>& lhs,
                        const SharedPtr<SchedulerTaskWrapper>& rhs) const;
    };

    Scheduler();
    ~Scheduler();

    Scheduler(const Scheduler&) = delete;
    Scheduler& operator=(const Scheduler&) = delete;

    static void OnTimer(sigval sv);
    void HandleTimer();
    void ResetTimerLocked();

    using TaskPtr = SharedPtr<SchedulerTaskWrapper>;
    using TaskQueue =
        WaitableQueue<TaskPtr, PriorityQueue<TaskPtr, std::vector<TaskPtr>,
                                             SchedulerTaskCompare>>;

    TaskQueue m_tasks;
    TaskPtr m_armedTask;
    std::mutex m_mutex;
    timer_t m_timer;
    uint64_t m_seq;

    friend class Singleton<Scheduler>;
};

} // namespace ilrd

#endif /* ILRD_SCHEDULER_HPP */
