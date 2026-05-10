/**
 * @file WireTypes.hpp
 * @brief Declares low-level fixed-width wire encoding helpers.
 */
#ifndef ILRD_CONCRETE_WIRE_TYPES_HPP
#define ILRD_CONCRETE_WIRE_TYPES_HPP

#include <array>
#include <cstddef>
#include <cstdint>
#include <stdexcept>
#include <vector>

#include "serialization/Serializer.hpp"

namespace ilrd::wire
{

/**
 * @brief Throws if a wire-level invariant is violated.
 * @param condition Invariant to validate.
 * @param message Error text used for the thrown exception.
 */
inline void Require(bool condition, const char* message)
{
    if (!condition)
    {
        throw std::runtime_error(message);
    }
}

/**
 * @brief Big-endian wrapper for an unsigned 8-bit value.
 */
struct U8
{
    std::uint8_t value = 0;

    Buffer& Serialize(Buffer& buffer) const
    {
        buffer << value;
        return buffer;
    }

    Buffer& Deserialize(Buffer& buffer)
    {
        buffer >> value;
        return buffer;
    }
};

/**
 * @brief Big-endian wrapper for an unsigned 16-bit value.
 */
struct U16
{
    std::uint16_t value = 0;

    Buffer& Serialize(Buffer& buffer) const
    {
        buffer << U8{static_cast<std::uint8_t>((value >> 8) & 0xFFu)};
        buffer << U8{static_cast<std::uint8_t>(value & 0xFFu)};
        return buffer;
    }

    Buffer& Deserialize(Buffer& buffer)
    {
        U8 b0;
        U8 b1;
        buffer >> b0 >> b1;
        value = static_cast<std::uint16_t>((b0.value << 8) | b1.value);
        return buffer;
    }
};

/**
 * @brief Big-endian wrapper for an unsigned 32-bit value.
 */
struct U32
{
    std::uint32_t value = 0;

    Buffer& Serialize(Buffer& buffer) const
    {
        for (int shift = 24; shift >= 0; shift -= 8)
        {
            buffer << U8{static_cast<std::uint8_t>((value >> shift) & 0xFFu)};
        }

        return buffer;
    }

    Buffer& Deserialize(Buffer& buffer)
    {
        value = 0;
        for (int i = 0; i < 4; ++i)
        {
            U8 byte;
            buffer >> byte;
            value = static_cast<std::uint32_t>((value << 8) | byte.value);
        }

        return buffer;
    }
};

/**
 * @brief Big-endian wrapper for an unsigned 64-bit value.
 */
struct U64
{
    std::uint64_t value = 0;

    Buffer& Serialize(Buffer& buffer) const
    {
        for (int shift = 56; shift >= 0; shift -= 8)
        {
            buffer << U8{static_cast<std::uint8_t>((value >> shift) & 0xFFu)};
        }

        return buffer;
    }

    Buffer& Deserialize(Buffer& buffer)
    {
        value = 0;
        for (int i = 0; i < 8; ++i)
        {
            U8 byte;
            buffer >> byte;
            value = static_cast<std::uint64_t>((value << 8) | byte.value);
        }

        return buffer;
    }
};

/**
 * @brief Big-endian wrapper for a signed 64-bit value.
 */
struct I64
{
    std::int64_t value = 0;

    Buffer& Serialize(Buffer& buffer) const
    {
        return (buffer << U64{static_cast<std::uint64_t>(value)});
    }

    Buffer& Deserialize(Buffer& buffer)
    {
        U64 raw;
        buffer >> raw;
        value = static_cast<std::int64_t>(raw.value);
        return buffer;
    }
};

inline U8 u8(std::uint8_t value)
{
    return U8{value};
}

inline U16 u16(std::uint16_t value)
{
    return U16{value};
}

inline U32 u32(std::uint32_t value)
{
    return U32{value};
}

inline U64 u64(std::uint64_t value)
{
    return U64{value};
}

inline I64 i64(std::int64_t value)
{
    return I64{value};
}

/**
 * @brief Serializes a fixed-size byte array into a buffer.
 * @tparam N Array size.
 * @param buffer Destination buffer.
 * @param data Source bytes.
 */
template <std::size_t N>
inline void WriteBytes(Buffer& buffer, const std::array<std::uint8_t, N>& data)
{
    for (std::size_t i = 0; i < N; ++i)
    {
        buffer << U8{data[i]};
    }
}

/**
 * @brief Serializes a raw byte range into a buffer.
 * @param buffer Destination buffer.
 * @param data Source bytes.
 * @param size Number of bytes to serialize.
 */
inline void WriteBytes(Buffer& buffer, const std::uint8_t* data, std::size_t size)
{
    for (std::size_t i = 0; i < size; ++i)
    {
        buffer << U8{data[i]};
    }
}

/**
 * @brief Reads exactly `N` bytes from a buffer.
 * @tparam N Number of bytes to read.
 * @param buffer Source buffer.
 * @return Fixed-size byte array.
 */
template <std::size_t N>
inline std::array<std::uint8_t, N> ReadFixedBytes(Buffer& buffer)
{
    std::array<std::uint8_t, N> bytes = {};
    for (std::size_t i = 0; i < N; ++i)
    {
        U8 byte;
        buffer >> byte;
        bytes[i] = byte.value;
    }

    return bytes;
}

/**
 * @brief Reads a variable number of bytes from a buffer.
 * @param buffer Source buffer.
 * @param size Number of bytes to read.
 * @return Byte vector containing the requested bytes.
 */
inline std::vector<std::uint8_t> ReadBytes(Buffer& buffer, std::size_t size)
{
    std::vector<std::uint8_t> bytes(size, 0);
    for (std::size_t i = 0; i < size; ++i)
    {
        U8 byte;
        buffer >> byte;
        bytes[i] = byte.value;
    }

    return bytes;
}

/**
 * @brief Creates a buffer pre-populated with the supplied bytes.
 * @param bytes Initial serialized contents.
 * @return Buffer containing `bytes`.
 */
inline Buffer MakeBuffer(const std::vector<std::uint8_t>& bytes)
{
    Buffer buffer;
    if (!bytes.empty())
    {
        WriteBytes(buffer, bytes.data(), bytes.size());
    }

    return buffer;
}

} // namespace ilrd::wire

#endif // ILRD_CONCRETE_WIRE_TYPES_HPP
