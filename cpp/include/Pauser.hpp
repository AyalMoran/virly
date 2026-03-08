#ifndef _ILRD_PAUSER_HPP
#define _ILRD_PAUSER_HPP

#include <condition_variable>
#include <cstddef>
#include <mutex>

namespace ilrd
{

class Pauser
{
  public:
    void ArmPause(std::size_t workers);
    void Pause();
    void WaitUntilPaused();
    void Resume();

  private:
    std::mutex m_mutex;
    std::condition_variable m_cv;
    bool m_pauseRequested = false;
    std::size_t m_targetPaused = 0;
    std::size_t m_currentPaused = 0;
};

} // namespace ilrd

#endif /* _ILRD_PAUSER_HPP */
