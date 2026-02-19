#include <cstddef>  // std::size_t
#include <memory>   // std::addressof

#ifndef ILRD_SHARED_PTR_HPP
#define ILRD_SHARED_PTR_HPP

namespace ilrd
{
template <typename T> class SharedPtr
{
  public:
    // ctor
    SharedPtr(T* ptr = nullptr);
    // dtor
    ~SharedPtr();
    // cctor
    SharedPtr(const SharedPtr& other);
    // op= //Exception safe
    SharedPtr& operator=(const SharedPtr& other);
    T* operator->();
    T& operator*();
    // - template member function
    // cctor
    template <typename U> SharedPtr(const SharedPtr<U>& other);
    // op=
    template <typename U> SharedPtr& operator=(const SharedPtr<U>& other);

    inline std::size_t UseCount() const;

    // friend functions
    template <typename U>
    friend class SharedPtr;

  private:
    T* m_ptr;
    std::size_t* m_counter;
};


template <typename T>
inline SharedPtr<T>::SharedPtr(T* ptr) : m_ptr(ptr) , m_counter(nullptr)
{
    try
    {
        m_counter = new std::size_t;
        *m_counter = 1;
    }
    catch (std::bad_alloc& e)
    {
        delete m_ptr;
        m_ptr = nullptr;
        m_counter = nullptr;
        throw e;
    }
}

template <typename T> inline SharedPtr<T>::~SharedPtr()
{
    if (m_counter)
    {
        --*m_counter;
        if (0 == *m_counter)
        {
            delete m_ptr;
            delete m_counter;
        }
    }
}

template <typename T>
inline SharedPtr<T>::SharedPtr(const SharedPtr& other)
    : m_ptr(other.m_ptr), m_counter(other.m_counter)
{
    ++*m_counter;
}

template <typename T>
inline SharedPtr<T>& SharedPtr<T>::operator=(const SharedPtr& other)
{
    if (this == std::addressof(other))
    {
        return *this;
    }
    if(m_counter)
    {
        --*m_counter;
        if (0 == *m_counter)
        {
            delete m_ptr;
            delete m_counter;
        }
    }
    m_ptr = other.m_ptr;
    m_counter = other.m_counter;
    if(m_counter)
    {
        *m_counter += 1;
    }

    return *this;
}

template <typename T> inline T* SharedPtr<T>::operator->()
{
    return m_ptr;
}

template <typename T> inline T& SharedPtr<T>::operator*()
{
    return *m_ptr;
}

template <typename T>
template <typename U>
inline SharedPtr<T>::SharedPtr(const SharedPtr<U>& other)
    : m_ptr(other.m_ptr), m_counter(other.m_counter)
{
    if(m_counter)
    {
        ++*m_counter;
    }
}

template <typename T>
template <typename U>
inline SharedPtr<T>& SharedPtr<T>::operator=(const SharedPtr<U>& other)
{
    if (this == reinterpret_cast<const SharedPtr<T>*>(std::addressof(other)))
    {
        return *this;
    }
    if(m_counter)
    {
        --*m_counter;
        if (0 == *m_counter)
        {
            delete m_ptr;
            delete m_counter;
        }
    }
    m_ptr = other.m_ptr;
    m_counter = other.m_counter;
    if(m_counter)
    {
        *m_counter += 1;
    }

    return *this;
}

template <typename T> inline std::size_t SharedPtr<T>::UseCount() const
{
    if(m_counter)
    {
        return *m_counter;
    }
    else
    {
        return 0;
    }
}

} // namespace ilrd

#endif // ILRD_SHARED_PTR_HPP
