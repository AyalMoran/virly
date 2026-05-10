/**************************************************************
 * File    : AsyncInjection.cpp
 * Author  : Ayal Moran
 * Reviewer: 
 * Date    : 2026-03-22
**************************************************************/

#include <string>       // std::to_string
#include <stdexcept>   // std::invalid_argument

#include "AsyncInjection.hpp"
#include "DebugLogger.hpp"
#include "SharedPtr.hpp"

namespace ilrd
{

class AsyncInjection::AsyncInjectionTask : public Scheduler::ISchedulerTask
{
  public:
    explicit AsyncInjectionTask(AsyncInjection& async_injection)
        : m_asyncInjection(async_injection)
    {
    }

    void Execute() override
    {
        ILRD_DEBUG_LOG("AsyncInjection task fired");
        m_asyncInjection.PerformAction();
    }

  private:
    AsyncInjection& m_asyncInjection;
};

AsyncInjection::AsyncInjection(Action action, std::chrono::milliseconds interval)
    : m_action(std::move(action)), m_interval(interval)
{
    if (!m_action)
    {
        throw std::invalid_argument("AsyncInjection action must not be empty");
    }

    ScheduleSelf();
    ILRD_DEBUG_LOG("AsyncInjection created with interval_ms=" +
                   std::to_string(m_interval.count()));
}

AsyncInjection::~AsyncInjection() = default;

void AsyncInjection::PerformAction()
{
    ILRD_DEBUG_LOG("AsyncInjection performing action");
    if (m_action())
    {
        ILRD_DEBUG_LOG("AsyncInjection action requested completion");
        delete this;
        return;
    }

    ILRD_DEBUG_LOG("AsyncInjection action requested reschedule");
    ScheduleSelf();
}

void AsyncInjection::ScheduleSelf()
{
    SharedPtr<Scheduler::ISchedulerTask> task(
        new AsyncInjectionTask(*this));
    Scheduler::GetInstance()->AddTask(task, m_interval);
    ILRD_DEBUG_LOG("AsyncInjection scheduled next run in interval_ms=" +
                   std::to_string(m_interval.count()));
}

} // namespace ilrd
