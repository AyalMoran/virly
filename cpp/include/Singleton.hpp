#ifndef ILRD_SINGLETON_HPP
#define ILRD_SINGLETON_HPP

#include <cstdlib>  // std::atexit

namespace ilrd
{

/** @brief Lazy, thread-safe singleton for type T. */
template <typename T>
class Singleton
{
  public:
    /** @brief Get the single instance of T. */
    static T* GetInstance();

  private:
    Singleton() = delete;
    ~Singleton() = delete;
    Singleton(const Singleton&) = delete;
    Singleton& operator=(const Singleton&) = delete;

    /** @brief Deletes the instance at process exit. */
    static void AtExit();

    static T* m_instance;
};

template <typename T>
T* Singleton<T>::m_instance = nullptr;

template <typename T>
T* Singleton<T>::GetInstance()
{
    static T* const s_instance = []() -> T* {
        m_instance = new T;
        std::atexit(&Singleton<T>::AtExit);
        return m_instance;
    }();

    return s_instance;
}

template <typename T>
void Singleton<T>::AtExit()
{
    delete m_instance;
    m_instance = nullptr;
}

} // namespace ilrd

#endif // ILRD_SINGLETON_HPP
