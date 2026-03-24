/**************************************************************
 * File    : AsyncInjection.hpp
 * Author  : Ayal Moran
 * Reviewer: 
 * Date    : 2026-03-22
**************************************************************/
#ifndef ILRD_ASYNCINJECTION_HPP
#define ILRD_ASYNCINJECTION_HPP

#include <chrono>    // std::chrono::milliseconds
#include <functional> // std::function

#include "Scheduler.hpp" // Scheduler

namespace ilrd
{

class AsyncInjection
{
  public:
    using Action = std::function<bool()>;

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
