/**************************************************************
 * File    : Scheduler.cpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/ 

 /*============================ INCLUDES ============================*/
 
 #include <cerrno>    // errno
#include <cstring>   // std::strerror
#include <iostream>
#include <stdexcept> // std::runtime_error
#include <chrono>    // std::chrono::*
#include <time.h>   // timespec
#include <signal.h> // sigval
#include <cassert> // assert

#include "SharedPtr.hpp" // SharedPtr
#include "Scheduler.hpp"
#include "Singleton.hpp"


namespace
{

timespec DurationToTimespec(std::chrono::nanoseconds ns)
{
    if (ns <= std::chrono::nanoseconds::zero())
    {
        ns = std::chrono::nanoseconds(1);
    }

    const std::chrono::seconds sec =
        std::chrono::duration_cast<std::chrono::seconds>(ns);
    const std::chrono::nanoseconds remainder = ns - sec;

    timespec ts = {};
    ts.tv_sec = sec.count();
    ts.tv_nsec = remainder.count();
    return ts;
}

} // namespace

namespace ilrd
{

Scheduler* Scheduler::GetInstance()
{
    return Singleton<Scheduler>::GetInstance();
}

Scheduler::Scheduler()
    : m_tasks(), m_armedTask(), m_mutex(), m_timer(), m_seq(0)
{
    sigevent sev = {};
    sev.sigev_notify = SIGEV_THREAD;
    sev.sigev_notify_function = &Scheduler::OnTimer;
    sev.sigev_notify_attributes = nullptr;
    sev.sigev_value.sival_ptr = this;

    if (0 != timer_create(CLOCK_MONOTONIC, &sev, &m_timer))
    {
        throw std::runtime_error(std::strerror(errno));
    }
}

Scheduler::~Scheduler()
{
    if(0 != timer_delete(m_timer))
    {
        std::cerr << "Failed to delete timer: " << std::strerror(errno) << std::endl;
    }
}

bool Scheduler::SchedulerTaskCompare::operator()(const TaskPtr& lhs,
                                                 const TaskPtr& rhs) const
{
    if (lhs->m_executionTime != rhs->m_executionTime)
    {
        return lhs->m_executionTime > rhs->m_executionTime;
    }

    return lhs->m_seq > rhs->m_seq;
}

void Scheduler::AddTask(SharedPtr<ISchedulerTask> task,
                        std::chrono::milliseconds dt_msec)
{
    assert(task);

    if (dt_msec < std::chrono::milliseconds::zero())
    {
        dt_msec = std::chrono::milliseconds::zero();
    }

    const std::chrono::steady_clock::time_point now =
        std::chrono::steady_clock::now();
    const std::chrono::steady_clock::time_point execution_time = now + dt_msec;

    std::lock_guard<std::mutex> lock(m_mutex);
    TaskPtr task_wrapper(
        new SchedulerTaskWrapper{task, execution_time, m_seq++});
    if (!m_armedTask)
    {
        m_armedTask = task_wrapper;
        ResetTimerLocked();
        return;
    }

    if (task_wrapper->m_executionTime < m_armedTask->m_executionTime)
    {
        m_tasks.Push(m_armedTask);
        m_armedTask = task_wrapper;
        ResetTimerLocked();
        return;
    }

    m_tasks.Push(task_wrapper);
}

void Scheduler::OnTimer(sigval sv)
{
    Scheduler::GetInstance()->HandleTimer();
    (void)sv;
}

void Scheduler::HandleTimer()
{
    SharedPtr<ISchedulerTask> task_to_run;

    {
        std::lock_guard<std::mutex> lock(m_mutex);
        if (!m_armedTask)
        {
            return;
        }

        const auto now = std::chrono::steady_clock::now();
        if (now < m_armedTask->m_executionTime)
        {
            ResetTimerLocked();
            return;
        }

        task_to_run = m_armedTask->m_schedulerTask;
        m_armedTask = TaskPtr(nullptr);

        TaskPtr next_task;
        if (m_tasks.Pop(std::chrono::milliseconds(0), next_task))
        {
            m_armedTask = next_task;
        }

        ResetTimerLocked();
    }

    try
    {
        task_to_run->Execute();
    }
    catch (...)
    {
    }
}

void Scheduler::ResetTimerLocked()
{
    itimerspec its = {};
    its.it_interval = {};

    if (m_armedTask)
    {
        const std::chrono::steady_clock::time_point now =
            std::chrono::steady_clock::now();
        const std::chrono::nanoseconds until_fire =
            std::chrono::duration_cast<std::chrono::nanoseconds>(
                m_armedTask->m_executionTime - now);
        its.it_value = DurationToTimespec(until_fire);
    }

    if (0 != timer_settime(m_timer, 0, &its, nullptr))
    {
        throw std::runtime_error(std::strerror(errno));
    }
}

} // namespace ilrd
