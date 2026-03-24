/**************************************************************
 * File    : AsyncInjection.cpp
 * Author  : Ayal Moran
 * Reviewer: 
 * Date    : 2026-03-22
**************************************************************/

#include <stdexcept>   // std::invalid_argument

#include "AsyncInjection.hpp"
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
}

AsyncInjection::~AsyncInjection() = default;

void AsyncInjection::PerformAction()
{
    if (m_action())
    {
        delete this;
        return;
    }

    ScheduleSelf();
}

void AsyncInjection::ScheduleSelf()
{
    SharedPtr<Scheduler::ISchedulerTask> task(
        new AsyncInjectionTask(*this));
    Scheduler::GetInstance()->AddTask(task, m_interval);
}

} // namespace ilrd
