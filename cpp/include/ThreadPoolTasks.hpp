#ifndef _ILRD_THREADPOOLTASKS_HPP
#define _ILRD_THREADPOOLTASKS_HPP

#include <functional>
#include <semaphore>

namespace ilrd
{

class TPTaskBase
{
  public:
    virtual void Execute() = 0;
    virtual bool IsKillTask() const;
    virtual ~TPTaskBase();
};

class TPFunctionTask : public TPTaskBase
{
  public:
    explicit TPFunctionTask(std::function<void()> fnc);
    void Execute() override;

  private:
    std::function<void()> m_fnc;
};

class TPKillTask : public TPTaskBase
{
  public:
    void Execute() override;
    bool IsKillTask() const override;
};

template <typename T> class TPFutureTask : public TPTaskBase
{
  public:
    explicit TPFutureTask(std::function<T()> fnc) : m_fnc(fnc), m_ret(), m_sem(0)
    {
    }

    void Execute() override
    {
        m_ret = m_fnc();
        m_sem.release();
    }

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
