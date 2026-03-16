/**************************************************************
 * File    : Handleton.hpp
 * Author  : Ayal Moran
 * Reviewer: 
 * Date    : 16-03-2026
**************************************************************/
#ifndef _ILRD_HANDLETON_HPP
#define _ILRD_HANDLETON_HPP

#ifdef I_AM_THE_HANDLETON_IMPLEMENTER
 
 #include <cstdlib> // std::atexit
 
 #if __cplusplus >= 201103L
 
 namespace ilrd
 {
 
 template <typename T>
 class Handleton
 {
   public:
     static T* GetInstance();
 
   private:
     Handleton() = delete;
     ~Handleton() = delete;
     Handleton(const Handleton&) = delete;
     Handleton& operator=(const Handleton&) = delete;
 
     static void AtExit();
 
     static T* m_instance;
 };
 
 template <typename T>
 T* Handleton<T>::m_instance = nullptr;
 
 template <typename T>
 T* Handleton<T>::GetInstance()
 {
     static T* const s_instance = []() -> T* {
         m_instance = new T;
         std::atexit(&Handleton<T>::AtExit);
         return m_instance;
     }();
 
     return s_instance;
 }
 
 template <typename T>
 void Handleton<T>::AtExit()
 {
     delete m_instance;
     m_instance = nullptr;
 }
 
 } // namespace ilrd
 
 #else // modern c++
 
 #include <pthread.h> // pthread_mutex_t
 #include "ScopeLock.hpp"
 
 namespace ilrd
 {
 
 template <typename T>
 class Handleton
 {
   public:
     static T* GetInstance();
 
   private:
     Handleton();
     ~Handleton();
     Handleton(const Handleton&);
     Handleton& operator=(const Handleton&);
 
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
 T* Handleton<T>::m_instance = 0;
 
 template <typename T>
 typename Handleton<T>::Mutex Handleton<T>::m_mutex;
 
 template <typename T>
 T* Handleton<T>::GetInstance()
 {
     ScopeLock<Mutex> guard(m_mutex);
 
     if (0 == m_instance)
     {
         m_instance = new T;
         std::atexit(&Handleton<T>::AtExit);
     }
 
     return m_instance;
 }
 
 template <typename T>
 void Handleton<T>::AtExit()
 {
     delete m_instance;
     m_instance = 0;
 }
 
 } // namespace ilrd
 
 
 #endif // __cplusplus

 #define INSTANTIATE_HANDLETON(T) template class ilrd::Handleton<T>; 
 
 #else // I_AM_THE_HANDLETON_IMPLEMENTER

 namespace ilrd
 {
 
 template<class T> 
 class Handleton 
 {
 public:
     Handleton() = delete;
     Handleton(const Handleton&) = delete;
     Handleton& operator=(const Handleton&) = delete;
 
     static T *GetInstance();
 };
 
 } // ilrd
 
 #endif // I_AM_THE_HANDLETON_IMPLEMENTER

#endif /* _ILRD_HANDLETON_HPP */
