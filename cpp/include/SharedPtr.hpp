#include <cstddef>  // std::size_t
#include <memory>   // std::addressof
#include <utility>  // std::swap
#include <algorithm> // std::swap
template <typename T> class SharedPtr
{
  public:
    // ctor
    SharedPtr(T* ptr);
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
    friend std::size_t* GetUseCount(const SharedPtr<U>& sp);
    template <typename U>
    friend U* GetPtr(const SharedPtr<U>& sp);

  private:
    T* m_ptr;
    std::size_t* m_counter;
};

template <typename T>
inline SharedPtr<T>::SharedPtr(T* ptr) : m_ptr(ptr), m_counter(new std::size_t)
{
    *m_counter = 1;
}

template <typename T> inline SharedPtr<T>::~SharedPtr()
{
    --*m_counter;
    if (0 == *m_counter)
    {
        delete m_ptr;
        delete m_counter;
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
    --*m_counter;
    if (0 == *m_counter)
    {
        delete m_ptr;
        delete m_counter;
    }

    m_ptr = other.m_ptr;
    m_counter = other.m_counter;
    *m_counter += 1;

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
    : m_ptr(reinterpret_cast<T*>(GetPtr(other))), m_counter(GetUseCount(other))
{
    ++*m_counter;
}

template <typename T>
template <typename U>
inline SharedPtr<T>& SharedPtr<T>::operator=(const SharedPtr<U>& other)
{
    if (this == reinterpret_cast<const SharedPtr<T>*>(std::addressof(other)))
    {
        return *this;
    }
    
    --*m_counter;
    if (0 == *m_counter)
    {
        delete m_ptr;
        delete m_counter;
    }

    SharedPtr<T> temp(other);
    std::swap(*this, temp);
    return *this;
}

template <typename T> inline std::size_t* GetUseCount(const SharedPtr<T>& sp)
{
    return sp.m_counter;
}

template <typename T> inline T* GetPtr(const SharedPtr<T>& sp)
{
    return sp.m_ptr;
}

template <typename T> inline std::size_t SharedPtr<T>::UseCount() const
{
    return *GetUseCount(*this);
}
