/**
 * @file ScopeLock.hpp
 * @brief Defines a minimal RAII lock guard for lockable types.
 */

namespace ilrd
{

/**
 * @brief Acquires a lock on construction and releases it on destruction.
 * @tparam T Lockable type that exposes `lock()` and `unlock()`.
 *
 * This helper is used by the legacy singleton helpers and other low-level
 * synchronization code that works with custom mutex wrappers.
 */
template <typename T>
class ScopeLock
{
  public:
    /**
     * @brief Locks the supplied object immediately.
     * @param to_lock Lockable object to guard for the lifetime of this instance.
     */
    explicit ScopeLock(T& to_lock);

    /**
     * @brief Unlocks the guarded object.
     */
    ~ScopeLock();

  private:
    T& m_lock;

#if __cplusplus >= 201103L
    ScopeLock<T>& operator=(const ScopeLock<T>& other) = delete;
    ScopeLock(const ScopeLock& other) = delete;
#else
    ScopeLock<T>& operator=(const ScopeLock<T>& other);
    ScopeLock(const ScopeLock& other);
#endif
};

template <typename T>
ScopeLock<T>::ScopeLock(T& to_lock) : m_lock(to_lock)
{
    m_lock.lock();
}

template <typename T>
ScopeLock<T>::~ScopeLock()
{
    m_lock.unlock();
}

} // namespace ilrd
