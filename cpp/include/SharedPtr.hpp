#include <cstddef>

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
    template <typename U> SharedPtr(const U& other);
    // op=
    template <typename U> SharedPtr& operator=(const U& other);

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
    }
}

template <typename T>
inline SharedPtr<T>::SharedPtr(const SharedPtr& other)
    : m_ptr(other.m_ptr), m_counter(m_counter)
{
}

template <typename T>
inline SharedPtr<T>& SharedPtr<T>::operator=(const SharedPtr& other)
{
    if (*this = other)
    {
        return *this;
    }
    --*m_counter;
    if (0 == *m_counter)
    {
        delete m_ptr;
    }

    m_ptr = other.m_ptr;
    m_counter = other.m_counter;

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
inline SharedPtr<T>::SharedPtr(const U& other)
{
}

template <typename T>
template <typename U>
inline SharedPtr<T>& SharedPtr<T>::operator=(const U& other)
{
}
