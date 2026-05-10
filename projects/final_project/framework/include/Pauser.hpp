/**
 * @file Pauser.hpp
 * @brief Declares a cooperative pause barrier for worker threads.
 */
#ifndef _ILRD_PAUSER_HPP
#define _ILRD_PAUSER_HPP

#include <condition_variable>
#include <cstddef>
#include <mutex>

namespace ilrd
{

/**
 * @brief Coordinates pausing and resuming a group of worker threads.
 *
 * Workers call Pause() at safe points, while a controller thread arms the
 * barrier and waits until the requested number of workers are parked.
 */
class Pauser
{
  public:
    /**
     * @brief Creates an idle pause controller.
     */
    explicit Pauser();

    /**
     * @brief Requests a pause once `workers` threads have checked in.
     * @param workers Number of worker threads expected to pause.
     */
    void ArmPause(std::size_t workers);

    /**
     * @brief Blocks the calling worker while a pause request is active.
     */
    void Pause();

    /**
     * @brief Waits until all targeted workers have reached Pause().
     */
    void WaitUntilPaused();

    /**
     * @brief Releases all paused workers and clears the active request.
     */
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
