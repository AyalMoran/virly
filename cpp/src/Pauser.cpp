#include "Pauser.hpp"

namespace ilrd
{

void Pauser::ArmPause(std::size_t workers)
{
    std::lock_guard<std::mutex> lock(m_mutex);
    m_pauseRequested = true;
    m_targetPaused = workers;
    m_currentPaused = 0;
}

void Pauser::Pause()
{
    std::unique_lock<std::mutex> lock(m_mutex);
    if (!m_pauseRequested)
    {
        return;
    }

    ++m_currentPaused;
    if (m_currentPaused >= m_targetPaused)
    {
        m_cv.notify_all();
    }

    m_cv.wait(lock, [this]() { return !m_pauseRequested; });
}

void Pauser::WaitUntilPaused()
{
    std::unique_lock<std::mutex> lock(m_mutex);
    m_cv.wait(lock,
              [this]() { return !m_pauseRequested || m_currentPaused >= m_targetPaused; });
}

void Pauser::Resume()
{
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_pauseRequested = false;
        m_targetPaused = 0;
        m_currentPaused = 0;
    }

    m_cv.notify_all();
}

} // namespace ilrd
