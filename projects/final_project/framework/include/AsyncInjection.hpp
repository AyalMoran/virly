/**************************************************************
 * File    : AsyncInjection.hpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    : 2026-03-22
**************************************************************/
/**
 * @file AsyncInjection.hpp
 * @brief Declares a self-rescheduling periodic action helper.
 */
#ifndef ILRD_ASYNCINJECTION_HPP
#define ILRD_ASYNCINJECTION_HPP

#include <chrono>     // std::chrono::milliseconds
#include <functional> // std::function

#include "Scheduler.hpp" // Scheduler

namespace ilrd
{

/**
 * @brief Runs an action asynchronously at a fixed interval until it returns true.
 *
 * The helper schedules itself through the global Scheduler. The stored action is
 * expected to return `false` to continue scheduling and `true` to stop.
 */
class AsyncInjection
{
  public:
    /**
     * @brief Action type executed on each scheduled tick.
     */
    using Action = std::function<bool()>;

    /**
     * @brief Starts periodic execution of `action`.
     * @param action Callable executed on each interval.
     * @param interval Delay between executions.
     */
    explicit AsyncInjection(Action action,
                            std::chrono::milliseconds interval);

    AsyncInjection(const AsyncInjection&) = delete;
    AsyncInjection& operator=(const AsyncInjection&) = delete;

  private:
    class AsyncInjectionTask;

    ~AsyncInjection();

    void PerformAction();
    void ScheduleSelf();

    Action m_action;
    std::chrono::milliseconds m_interval;
};

} // namespace ilrd

#endif /* ILRD_ASYNCINJECTION_HPP */
