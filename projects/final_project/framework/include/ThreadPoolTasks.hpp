/**
 * @file ThreadPoolTasks.hpp
 * @brief Declares helper task types used by the thread pool.
 */
#ifndef _ILRD_THREADPOOLTASKS_HPP
#define _ILRD_THREADPOOLTASKS_HPP

#include <functional>
#include <semaphore>

namespace ilrd
{

/**
 * @brief Abstract base class for thread-pool tasks.
 */
class TPTaskBase
{
  public:
    /**
     * @brief Executes the task body.
     */
    virtual void Execute() = 0;

    /**
     * @brief Indicates whether this task requests worker shutdown.
     * @return `true` for kill tasks, otherwise `false`.
     */
    virtual bool IsKillTask() const;

    /**
     * @brief Virtual destructor for polymorphic deletion.
     */
    virtual ~TPTaskBase();
};

/**
 * @brief Wraps a simple `std::function<void()>` as a thread-pool task.
 */
class TPFunctionTask : public TPTaskBase
{
  public:
    /**
     * @brief Stores the callable to execute later.
     * @param fnc Callable body for Execute().
     */
    explicit TPFunctionTask(std::function<void()> fnc);

    /**
     * @brief Executes the stored callable.
     */
    void Execute() override;

  private:
    std::function<void()> m_fnc;
};

/**
 * @brief Sentinel task used to stop worker threads.
 */
class TPKillTask : public TPTaskBase
{
  public:
    /**
     * @brief Performs the kill-task action understood by the worker loop.
     */
    void Execute() override;

    /**
     * @brief Marks this task as a worker shutdown request.
     * @return Always `true`.
     */
    bool IsKillTask() const override;
};

/**
 * @brief Task wrapper that stores a return value retrievable via Get().
 * @tparam T Return type produced by the stored callable.
 */
template <typename T>
class TPFutureTask : public TPTaskBase
{
  public:
    /**
     * @brief Stores the callable and initializes the completion semaphore.
     * @param fnc Callable that produces the future value.
     */
    explicit TPFutureTask(std::function<T()> fnc) : m_fnc(fnc), m_ret(), m_sem(0)
    {
    }

    /**
     * @brief Executes the callable and releases any waiting Get() call.
     */
    void Execute() override
    {
        m_ret = m_fnc();
        m_sem.release();
    }

    /**
     * @brief Waits for the task to finish and returns the stored result.
     * @return Value produced by the callable.
     */
    T Get()
    {
        m_sem.acquire();
        return m_ret;
    }

  private:
    std::function<T()> m_fnc;
    T m_ret;
    std::binary_semaphore m_sem;
};

} // namespace ilrd

#endif /* _ILRD_THREADPOOLTASKS_HPP */
