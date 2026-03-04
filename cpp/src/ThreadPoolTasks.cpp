#include "ThreadPoolTasks.hpp"

namespace ilrd
{

bool TPTaskBase::IsKillTask() const
{
    return false;
}

TPTaskBase::~TPTaskBase() = default;

TPFunctionTask::TPFunctionTask(std::function<void()> fnc) : m_fnc(fnc)
{
}

void TPFunctionTask::Execute()
{
    m_fnc();
}

void TPKillTask::Execute()
{
}

bool TPKillTask::IsKillTask() const
{
    return true;
}

} // namespace ilrd
