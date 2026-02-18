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


template <typename T> inline SharedPtr<T>::SharedPtr(T* ptr)
{
}

template <typename T> inline SharedPtr<T>::~SharedPtr()
{
}

template <typename T> inline SharedPtr<T>::SharedPtr(const SharedPtr& other)
{
}

template <typename T>
inline SharedPtr& SharedPtr<T>::operator=(const SharedPtr& other)
{
    // TODO: insert return statement here
}

template <typename T> inline T* SharedPtr<T>::operator->()
{
    return nullptr;
}

template <typename T> inline T& SharedPtr<T>::operator*()
{
    // TODO: insert return statement here
}

template <typename T>
template <typename U>
inline SharedPtr<T>::SharedPtr(const U& other)
{
}

template <typename T>
template <typename U>
inline SharedPtr& SharedPtr<T>::operator=(const U& other)
{
    // TODO: insert return statement here
}
