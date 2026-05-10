/**
 * @file SharedPtr.hpp
 * @brief Declares a small intrusive-style shared ownership smart pointer.
 */
#include <atomic> // std::atomic_size_t
#include <cstddef> // std::size_t
#include <memory> // std::addressof

#ifndef ILRD_SHARED_PTR_HPP
#define ILRD_SHARED_PTR_HPP

namespace ilrd
{

/**
 * @brief Reference-counted smart pointer with shared ownership semantics.
 * @tparam T Managed object type.
 *
 * This implementation stores the managed pointer and a heap-allocated atomic
 * reference counter. It supports copy construction across compatible types.
 */
template <typename T>
class SharedPtr
{
  public:
    /**
     * @brief Takes ownership of a raw pointer.
     * @param ptr Pointer to manage, or `nullptr`.
     */
    explicit SharedPtr(T* ptr = nullptr);

    /**
     * @brief Releases one shared reference and destroys the object if needed.
     */
    ~SharedPtr();

    /**
     * @brief Shares ownership with another pointer of the same type.
     * @param other Pointer to share ownership with.
     */
    SharedPtr(const SharedPtr& other);

    /**
     * @brief Shares ownership with another pointer of the same type.
     * @param other Pointer to share ownership with.
     * @return `*this`.
     */
    SharedPtr& operator=(const SharedPtr& other);

    /**
     * @brief Provides member access to the managed object.
     * @return Managed raw pointer.
     */
    T* operator->();

    /**
     * @brief Provides member access to the managed object.
     * @return Managed raw pointer.
     */
    const T* operator->() const;

    /**
     * @brief Dereferences the managed object.
     * @return Reference to the managed object.
     */
    T& operator*();

    /**
     * @brief Dereferences the managed object.
     * @return Const reference to the managed object.
     */
    const T& operator*() const;

    /**
     * @brief Shares ownership with a compatible pointer type.
     * @tparam U Source managed type.
     * @param other Pointer to share ownership with.
     */
    template <typename U>
    SharedPtr(const SharedPtr<U>& other);

    /**
     * @brief Shares ownership with a compatible pointer type.
     * @tparam U Source managed type.
     * @param other Pointer to share ownership with.
     * @return `*this`.
     */
    template <typename U>
    SharedPtr& operator=(const SharedPtr<U>& other);

    /**
     * @brief Checks whether a non-null object is managed.
     * @return `true` when the pointer is non-null.
     */
    operator bool() const;

    /**
     * @brief Compares managed raw pointers for equality.
     * @param other Pointer to compare against.
     * @return `true` when both instances point to the same object.
     */
    bool operator==(const SharedPtr& other) const;

    /**
     * @brief Compares managed raw pointers for inequality.
     * @param other Pointer to compare against.
     * @return `true` when the managed pointers differ.
     */
    bool operator!=(const SharedPtr& other) const;

    /**
     * @brief Returns the current shared ownership count.
     * @return Number of active SharedPtr instances managing the object.
     */
    inline std::size_t UseCount() const;

    template <typename U>
    friend class SharedPtr;

  private:
    void DecreaseAndDelete();

    T* m_ptr;
    std::atomic_size_t* m_counter;
};

template <typename T>
inline void SharedPtr<T>::DecreaseAndDelete()
{
    if (m_counter)
    {
        if (1 == m_counter->fetch_sub(1, std::memory_order_acq_rel))
        {
            delete m_ptr;
            delete m_counter;
        }
    }
}

template <typename T>
inline SharedPtr<T>::SharedPtr(T* ptr) : m_ptr(ptr), m_counter(nullptr)
{
    if (nullptr != ptr)
    {
        try
        {
            m_counter = new std::atomic_size_t(1);
        }
        catch (std::bad_alloc& e)
        {
            delete m_ptr;
            m_ptr = nullptr;
            m_counter = nullptr;
            throw e;
        }
    }
}

template <typename T>
inline SharedPtr<T>::~SharedPtr()
{
    DecreaseAndDelete();
}

template <typename T>
inline SharedPtr<T>::SharedPtr(const SharedPtr& other)
    : m_ptr(other.m_ptr), m_counter(other.m_counter)
{
    if (other.m_counter)
    {
        m_counter->fetch_add(1, std::memory_order_relaxed);
    }
}

template <typename T>
inline SharedPtr<T>& SharedPtr<T>::operator=(const SharedPtr& other)
{
    if (this == std::addressof(other))
    {
        return *this;
    }

    DecreaseAndDelete();
    m_ptr = other.m_ptr;
    m_counter = other.m_counter;
    if (m_counter)
    {
        m_counter->fetch_add(1, std::memory_order_relaxed);
    }

    return *this;
}

template <typename T>
inline T* SharedPtr<T>::operator->()
{
    return m_ptr;
}

template <typename T>
inline const T* SharedPtr<T>::operator->() const
{
    return m_ptr;
}

template <typename T>
inline T& SharedPtr<T>::operator*()
{
    return *m_ptr;
}

template <typename T>
inline const T& SharedPtr<T>::operator*() const
{
    return *m_ptr;
}

template <typename T>
template <typename U>
inline SharedPtr<T>::SharedPtr(const SharedPtr<U>& other)
    : m_ptr(other.m_ptr), m_counter(other.m_counter)
{
    if (m_counter)
    {
        m_counter->fetch_add(1, std::memory_order_relaxed);
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

    DecreaseAndDelete();

    m_ptr = other.m_ptr;
    m_counter = other.m_counter;
    if (m_counter)
    {
        m_counter->fetch_add(1, std::memory_order_relaxed);
    }

    return *this;
}

template <typename T>
inline std::size_t SharedPtr<T>::UseCount() const
{
    if (m_counter)
    {
        return m_counter->load(std::memory_order_relaxed);
    }
    else
    {
        return 0;
    }
}

template <typename T>
inline SharedPtr<T>::operator bool() const
{
    return nullptr != m_ptr;
}

template <typename T>
inline bool SharedPtr<T>::operator==(const SharedPtr& other) const
{
    return m_ptr == other.m_ptr;
}

template <typename T>
inline bool SharedPtr<T>::operator!=(const SharedPtr& other) const
{
    return m_ptr != other.m_ptr;
}

} // namespace ilrd

#endif // ILRD_SHARED_PTR_HPP
