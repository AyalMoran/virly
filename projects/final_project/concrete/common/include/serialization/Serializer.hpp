/**
 * @file Serializer.hpp
 * @brief Declares the generic serialization buffer and traits helpers.
 */
#ifndef ILRD_CONCRETE_SERIALIZER_HPP
#define ILRD_CONCRETE_SERIALIZER_HPP

#include <cstdint>
#include <cstring>
#include <iostream>
#include <string>
#include <type_traits>
#include <utility>

namespace ilrd
{

/**
 * @brief Legacy trait retained for older serialization code paths.
 * @tparam T Candidate type.
 */
template <typename T>
struct is_pod
{
    static constexpr bool value =
        std::is_fundamental<typename std::remove_cv<T>::type>::value;
};

/**
 * @brief Dynamically sized byte buffer used for serialization and parsing.
 *
 * `Buffer` supports trivially copyable values, types that expose
 * `Serialize(Buffer&)`/`Deserialize(Buffer&)`, and contiguous resizable
 * containers of trivially copyable elements.
 */
class Buffer
{
  public:
    /**
     * @brief Creates an empty buffer.
     */
    Buffer() : m_data(nullptr), m_size(0), m_readOffset(0)
    {
    }

    /**
     * @brief Releases the owned storage.
     */
    ~Buffer()
    {
        free(m_data);
    }

    /**
     * @brief Copies the underlying serialized bytes and read offset.
     * @param other Source buffer.
     */
    Buffer(const Buffer& other)
        : m_data(nullptr), m_size(other.m_size), m_readOffset(other.m_readOffset)
    {
        if (0 != m_size)
        {
            m_data = static_cast<unsigned char*>(std::malloc(m_size));
            if (!m_data)
            {
                throw std::bad_alloc();
            }

            std::memcpy(m_data, other.m_data, m_size);
        }
    }

    /**
     * @brief Replaces this buffer with a copy of another buffer.
     * @param other Source buffer.
     * @return `*this`.
     */
    Buffer& operator=(const Buffer& other)
    {
        if (this != &other)
        {
            Buffer temp(other);
            std::swap(m_data, temp.m_data);
            std::swap(m_size, temp.m_size);
            std::swap(m_readOffset, temp.m_readOffset);
        }
        return *this;
    }

    /**
     * @brief Returns the number of serialized bytes currently stored.
     * @return Buffer size in bytes.
     */
    uint64_t GetSize() const
    {
        return m_size;
    }

    /**
     * @brief Returns the raw serialized byte storage.
     * @return Pointer to the underlying data, or `nullptr` if empty.
     */
    const unsigned char* GetData() const
    {
        return m_data;
    }

    /**
     * @brief Detects whether `T` supports `Serialize(Buffer&) const`.
     * @tparam T Candidate type.
     */
    template <typename T>
    static constexpr bool has_serialize_v = requires(const T& t, Buffer& b) {
        { t.Serialize(b) } -> std::same_as<Buffer&>;
    };

    /**
     * @brief Detects whether `T` supports `Deserialize(Buffer&)`.
     * @tparam T Candidate type.
     */
    template <typename T>
    static constexpr bool has_deserialize_v = requires(T& t, Buffer& b) {
        { t.Deserialize(b) } -> std::same_as<Buffer&>;
    };

    /**
     * @brief Detects contiguous resizable containers of trivially copyable values.
     * @tparam T Candidate type.
     */
    template <typename T>
    static constexpr bool is_contiguous_resizable_container_v =
        requires(T& t, const T& ct, std::size_t size)
    {
        typename T::value_type;
        requires std::is_trivially_copyable_v<typename T::value_type>;
        { ct.size() } -> std::convertible_to<std::size_t>;
        { ct.data() };
        { t.data() };
        { t.resize(size) };
    };

    /**
     * @brief Appends a serializable value to the buffer.
     * @tparam T Value type.
     * @param data Value to serialize.
     * @return `*this`.
     */
    template <typename T>
    Buffer& operator<<(const T& data)
    {
        if constexpr (has_serialize_v<T>)
        {
            return data.Serialize(*this);
        }
        else if constexpr (is_contiguous_resizable_container_v<T> &&
                           !std::is_trivially_copyable_v<T>)
        {
            WriteContainer(data);
            return *this;
        }
        else if constexpr (std::is_trivially_copyable_v<T>)
        {
            WriteRaw(data);
            return *this;
        }
        else
        {
            static_assert(has_serialize_v<T> ||
                              is_contiguous_resizable_container_v<T> ||
                              std::is_trivially_copyable_v<T>,
                          "Type must either provide Serialize(Buffer&) or be "
                          "trivially copyable or a contiguous resizable container");
        }
    }

    /**
     * @brief Reads the next value from the buffer into `data`.
     * @tparam T Value type.
     * @param data Destination object to populate.
     * @return `*this`.
     */
    template <typename T>
    Buffer& operator>>(T& data)
    {
        if constexpr (has_deserialize_v<T>)
        {
            return data.Deserialize(*this);
        }
        else if constexpr (is_contiguous_resizable_container_v<T> &&
                           !std::is_trivially_copyable_v<T>)
        {
            ReadContainer(data);
            return *this;
        }
        else if constexpr (std::is_trivially_copyable_v<T>)
        {
            ReadRaw(data);
            return *this;
        }
        else
        {
            static_assert(has_deserialize_v<T> ||
                              is_contiguous_resizable_container_v<T> ||
                              std::is_trivially_copyable_v<T>,
                          "Type must either provide Deserialize(Buffer&) or be "
                          "trivially copyable or a contiguous resizable container");
        }
    }

  private:
    void WriteBytes(const void* src, std::uint64_t num_bytes)
    {
        const std::uint64_t new_size = m_size + num_bytes;
        m_data = static_cast<unsigned char*>(std::realloc(m_data, new_size));
        if (!m_data)
        {
            throw std::bad_alloc();
        }

        std::memcpy(m_data + m_size, src, num_bytes);
        m_size = new_size;
    }

    void ReadBytes(void* dst, std::uint64_t num_bytes)
    {
        if (m_readOffset + num_bytes > m_size)
        {
            throw std::runtime_error("Buffer underflow while reading bytes");
        }

        std::memcpy(dst, m_data + m_readOffset, num_bytes);
        m_readOffset += num_bytes;
    }

    template <typename T>
    void WriteRaw(const T& data)
    {
        static_assert(std::is_trivially_copyable_v<T>);
        WriteBytes(&data, sizeof(T));
    }

    template <typename T>
    void ReadRaw(T& data)
    {
        static_assert(std::is_trivially_copyable_v<T>);
        ReadBytes(&data, sizeof(T));
    }

    template <typename T>
    void WriteContainer(const T& data)
    {
        const std::uint64_t element_count = static_cast<std::uint64_t>(data.size());
        *this << element_count;

        if (0 == element_count)
        {
            return;
        }

        WriteBytes(data.data(),
                   element_count * sizeof(typename T::value_type));
    }

    template <typename T>
    void ReadContainer(T& data)
    {
        std::uint64_t element_count = 0;
        *this >> element_count;

        if (element_count >
            static_cast<std::uint64_t>(-1) / sizeof(typename T::value_type))
        {
            throw std::runtime_error("Container size overflow while reading");
        }

        data.resize(static_cast<std::size_t>(element_count));
        if (0 == element_count)
        {
            return;
        }

        ReadBytes(data.data(),
                  element_count * sizeof(typename T::value_type));
    }

  private:
    unsigned char* m_data;
    uint64_t m_size;
    uint64_t m_readOffset;
};

} // namespace ilrd

#endif // ILRD_CONCRETE_SERIALIZER_HPP
