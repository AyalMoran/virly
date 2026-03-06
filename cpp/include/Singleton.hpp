/*************************************
 * File: Singleton.hpp
 * Author: Ayal Moran
 * Reviewer:
 * Date: 06-03-2026
 *************************************/

#ifndef ILRD_SINGLETON_HPP
#define ILRD_SINGLETON_HPP

#include <cstdlib> // std::atexit

#if __cplusplus >= 201103L

namespace ilrd
{

template <typename T>
class Singleton
{
  public:
    static T* GetInstance();

  private:
    Singleton() = delete;
    ~Singleton() = delete;
    Singleton(const Singleton&) = delete;
    Singleton& operator=(const Singleton&) = delete;

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

#else

#include <pthread.h> // pthread_mutex_t, pthread_mutex_* API
#include "ScopeLock.hpp"

namespace ilrd
{

template <typename T>
class Singleton
{
  public:
    static T* GetInstance();

  private:
    Singleton();
    ~Singleton();
    Singleton(const Singleton&);
    Singleton& operator=(const Singleton&);

    class Mutex
    {
      public:
        Mutex()
        {
            pthread_mutex_init(&m_mutex, 0);
        }

        ~Mutex()
        {
            pthread_mutex_destroy(&m_mutex);
        }

        void lock()
        {
            pthread_mutex_lock(&m_mutex);
        }

        void unlock()
        {
            pthread_mutex_unlock(&m_mutex);
        }

      private:
        Mutex(const Mutex&);
        Mutex& operator=(const Mutex&);

        pthread_mutex_t m_mutex;
    };

    static void AtExit();

    static T* m_instance;
    static Mutex m_mutex;
};

template <typename T>
T* Singleton<T>::m_instance = 0;

template <typename T>
typename Singleton<T>::Mutex Singleton<T>::m_mutex;

template <typename T>
T* Singleton<T>::GetInstance()
{
    ScopeLock<Mutex> guard(m_mutex);

    if (0 == m_instance)
    {
        m_instance = new T;
        std::atexit(&Singleton<T>::AtExit);
    }

    return m_instance;
}

template <typename T>
void Singleton<T>::AtExit()
{
    ScopeLock<Mutex> guard(m_mutex);
    delete m_instance;
    m_instance = 0;
}

} // namespace ilrd

#endif // __cplusplus

#endif // ILRD_SINGLETON_HPP
