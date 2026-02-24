/**************************************************************
 * File    : BitArray.hpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/
#ifndef _ILRD_BITARRAY_HPP
#define _ILRD_BITARRAY_HPP

#include <algorithm> // std::fill
#include <climits>   // CHAR_BIT
#include <cstddef>   // std::size_t
#include <iterator>  // std::begin
#include <limits>    // std::numeric_limits
#include <numeric>   // std::accumulate
#include <stdexcept> // std::out_of_range
#include <string>    // std::string

namespace ilrd
{
// recursive defines for count()'s LUT building
#define B2(n) n, n + 1, n + 1, n + 2
#define B4(n) B2(n), B2(n + 1), B2(n + 1), B2(n + 2)
#define B6(n) B4(n), B4(n + 1), B4(n + 1), B4(n + 2)

/**
 * @brief Default number of bits when using `BitArray<>`.
 */
const std::size_t DEFAULT_BIT_ARR_SIZE = 32;
/**
 * @brief Number of bits in one storage word (`std::size_t`).
 */
const std::size_t BITS_IN_WORD = sizeof(std::size_t) * CHAR_BIT;

//*-----------------------------Helper Functions-----------------------------
template <std::size_t N>
static std::size_t GetLastWord(const std::size_t* words)
{
    constexpr std::size_t num_words = (N + BITS_IN_WORD - 1) / BITS_IN_WORD;
    constexpr std::size_t extra_bits = N % BITS_IN_WORD;
    constexpr std::size_t last_mask =
        extra_bits != 0 ? (1ULL << extra_bits) - 1 : ~0;
    return words[num_words - 1] & last_mask;
}

/**
   * @brief Checks whether a bit index is within the
  valid range.
   * @param pos Index to validate.
   * @param size Number of bits in the bit array.
   * @throws std::out_of_range If `pos >= size`.
   */
  static void RangeCheck(std::size_t pos, std::size_t
  size)
  {
    if (pos >= size)
    {
        std::string throw_msg = "Bit position " + std::to_string(pos) +
                                " is out of range for BitArray<" +
                                std::to_string(size) + ">";
        throw std::out_of_range(throw_msg);
    }
}

//*-----------------------------Functors-----------------------------
class EqualHelper
{
  public:
    bool operator()(const std::size_t& this_word,
                    const std::size_t& that_word) const
    {
        return GetLastWord<sizeof(std::size_t) * CHAR_BIT>(&this_word) ==
               GetLastWord<sizeof(std::size_t) * CHAR_BIT>(&that_word);
    }
};

class CountHelper
{
  public:
    CountHelper(std::size_t& count_bits, const unsigned char* BitCountTable)
        : m_countBits(count_bits), m_BitCountTable(BitCountTable)
    {
    }

    void operator()(std::size_t word)
    {
        unsigned char* start = reinterpret_cast<unsigned char*>(&word);
        unsigned char* end = start + sizeof(std::size_t);
        if (word == 0)
        {
            return;
        }
        m_countBits += std::accumulate(
            start, end, 0ULL, [this](std::size_t acc, unsigned char byte)
            { return acc + m_BitCountTable[byte]; });
    }

  private:
    std::size_t& m_countBits;
    const unsigned char* m_BitCountTable;
};

//*----------------------------- Class BitArray --------------------------

template <std::size_t N = DEFAULT_BIT_ARR_SIZE> class BitArray
{
  private:
    /**
     * @brief Proxy reference for non-const bit access.
     */
    class BitRef
    {
      public:
        BitRef(std::size_t& word, std::size_t mask);
        BitRef& operator=(bool value);
        BitRef& operator=(const BitRef& other);
        operator bool() const;
        bool operator!() const;

      private:
        std::size_t& m_word;
        std::size_t m_mask;
    };

  public:
    /**
     * @brief Constructs a bit array with all bits initialized to `initial_all_value`.
     * @param initial_all_value Initial value for all bits.
     */
    BitArray(bool initial_all_value = false);
    /**
     * @brief Copy constructor.
     * @param other Source bit array.
     */
    BitArray(const BitArray& other);

    /**
     * @brief Copy assignment.
     * @param other Source bit array.
     * @return `*this`.
     */
    BitArray& operator=(const BitArray& other);
    /**
     * @brief Returns bit value at index.
     * @param index Bit index.
     * @return Bit value at `index`.
     */
    bool operator[](std::size_t index) const;
    /**
     * @brief Returns writable proxy reference to bit at index.
     * @param index Bit index.
     * @return Proxy bit reference.
     */
    BitRef operator[](std::size_t index);
    /**
     * @brief Bitwise OR assignment.
     * @param other Right-hand operand.
     * @return `*this`.
     */
    BitArray& operator|=(const BitArray& other);
    /**
     * @brief Bitwise AND assignment.
     * @param other Right-hand operand.
     * @return `*this`.
     */
    BitArray& operator&=(const BitArray& other);
    /**
     * @brief Bitwise XOR assignment.
     * @param other Right-hand operand.
     * @return `*this`.
     */
    BitArray& operator^=(const BitArray& other);
    /**
     * @brief Equality comparison.
     * @param other Right-hand operand.
     * @return `true` if all bits are equal; otherwise `false`.
     */
    bool operator==(const BitArray& other) const;
    /**
     * @brief Inequality comparison.
     * @param other Right-hand operand.
     * @return `true` if arrays differ; otherwise `false`.
     */
    bool operator!=(const BitArray& other) const;
    /**
     * @brief Left-shift assignment.
     * @param shift Number of positions to shift.
     * @return `*this`.
     */
    BitArray& operator<<=(std::size_t shift);
    /**
     * @brief Right-shift assignment.
     * @param shift Number of positions to shift.
     * @return `*this`.
     */
    BitArray& operator>>=(std::size_t shift);
    /**
     * @brief Returns a left-shifted copy.
     * @param shift Number of positions to shift.
     * @return Shifted copy.
     */
    const BitArray operator<<(std::size_t shift) const;
    /**
     * @brief Returns a right-shifted copy.
     * @param shift Number of positions to shift.
     * @return Shifted copy.
     */
    const BitArray operator>>(std::size_t shift) const;

    /**
     * @brief Sets all bits to `value`.
     * @param value Value to assign to all bits.
     * @return `*this`.
     */
    BitArray& Set(bool value);
    /**
     * @brief Sets a specific bit.
     * @param pos Bit index.
     * @param value Value to set.
     * @return `*this`.
     * @throws std::out_of_range If `pos >= N`.
     */
    BitArray& Set(std::size_t pos, bool value = true);
    /**
     * @brief Resets all bits to `false`.
     * @return `*this`.
     */
    BitArray& Reset();
    /**
     * @brief Resets a specific bit to `false`.
     * @param pos Bit index.
     * @return `*this`.
     * @throws std::out_of_range If `pos >= N`.
     */
    BitArray& Reset(std::size_t pos);
    /**
     * @brief Gets the value of a specific bit.
     * @param pos Bit index.
     * @return Bit value at `pos`.
     * @throws std::out_of_range If `pos >= N`.
     */
    bool Get(std::size_t pos) const;
    /**
     * @brief Flips all bits.
     * @return `*this`.
     */
    BitArray& Flip();
    /**
     * @brief Flips a specific bit.
     * @param pos Bit index.
     * @return `*this`.
     * @throws std::out_of_range If `pos >= N`.
     */
    BitArray& Flip(std::size_t pos);

    /**
     * @brief Counts the number of set bits.
     * @return Number of bits set to `true`.
     */
    std::size_t Count() const;
    /**
     * @brief Converts the bit array to a string representation.
     * @param zero Character used for cleared bits.
     * @param one Character used for set bits.
     * @return String representation of the bit array.
     * @throws std::bad_alloc On allocation failure.
     */
    std::string ToString(char zero = '0', char one = '1') const;

  private:
  

  private:
    std::size_t m_words[(N / (sizeof(std::size_t) * CHAR_BIT)) + 1];
};
//*----------------------------- Member Functions --------------------------
//* Member Functions ================================================
// Default Ctor
template <std::size_t N>
BitArray<N>::BitArray(bool initial_all_value) : m_words{0ULL}
{
    if (initial_all_value)
    {
        Set(initial_all_value);
    }
}

template <std::size_t N>
BitArray<N>::BitArray(const BitArray& other) : m_words()
{
    std::copy(std::begin(other.m_words), std::end(other.m_words),
              std::begin(m_words));
}

//* BitRef Member Functions ================================================
template <std::size_t N>
BitArray<N>::BitRef::BitRef(std::size_t& word, std::size_t mask)
    : m_word(word), m_mask(mask)
{
}

template <std::size_t N> BitArray<N>::BitRef::operator bool() const
{
    return (m_word & m_mask) != 0ULL;
}

template <std::size_t N>
typename BitArray<N>::BitRef& BitArray<N>::BitRef::operator=(bool value)
{
    if (value)
    {
        m_word |= m_mask;
    }
    else
    {
        m_word &= ~m_mask;
    }
    return *this;
}

template <std::size_t N>
typename BitArray<N>::BitRef&
BitArray<N>::BitRef::operator=(const BitRef& other)
{
    return (*this = static_cast<bool>(other));
}

template <std::size_t N> bool BitArray<N>::BitRef::operator!() const
{
    return !static_cast<bool>(*this);
}

// BitArray ================================================

// Bit Array Member Functions ================================================
template <std::size_t N>
BitArray<N>& BitArray<N>::operator=(const BitArray<N>& other)
{
    std::copy(std::begin(other.m_words), std::end(other.m_words),
              std::begin(m_words));
    return *this;
}

/*Operator [] for const*/
template <std::size_t N> bool BitArray<N>::operator[](std::size_t index) const
{
    return Get(index);
}

template <std::size_t N>
typename BitArray<N>::BitRef BitArray<N>::operator[](std::size_t index)
{
    RangeCheck(index, N);
    const std::size_t word_index = index / BITS_IN_WORD;
    const std::size_t mask = (1ULL << (index % BITS_IN_WORD));

    return BitRef(m_words[word_index], mask);
}

/*Operator |= */
template <std::size_t N>
BitArray<N>& BitArray<N>::operator|=(const BitArray& other)
{
    constexpr std::size_t num_words = (N + BITS_IN_WORD - 1) / BITS_IN_WORD;
    constexpr std::size_t extra_bits = N % BITS_IN_WORD;

    std::size_t i = 0;
    for (; i + 1 < num_words; ++i)
    {
        m_words[i] |= other.m_words[i];
    }

    if (extra_bits == 0)
    {
        m_words[num_words - 1] |= other.m_words[num_words - 1];
    }
    else
    {
        m_words[num_words - 1] =
            GetLastWord<N>(m_words) | GetLastWord<N>(other.m_words);
    }

    return *this;
}
/*Operator &=*/
template <std::size_t N>
BitArray<N>& BitArray<N>::operator&=(const BitArray& other)
{
    constexpr std::size_t num_words = (N + BITS_IN_WORD - 1) / BITS_IN_WORD;
    constexpr std::size_t extra_bits = N % BITS_IN_WORD;

    std::size_t i = 0;
    for (; i + 1 < num_words; ++i)
    {
        m_words[i] &= other.m_words[i];
    }

    if (extra_bits == 0)
    {
        m_words[num_words - 1] &= other.m_words[num_words - 1];
    }
    else
    {
        m_words[num_words - 1] =
            GetLastWord<N>(m_words) & GetLastWord<N>(other.m_words);
    }
    return *this;
}
/*Operator ^=*/
template <std::size_t N>
BitArray<N>& BitArray<N>::operator^=(const BitArray& other)
{
    constexpr std::size_t num_words = (N + BITS_IN_WORD - 1) / BITS_IN_WORD;
    constexpr std::size_t extra_bits = N % BITS_IN_WORD;

    std::size_t i = 0;
    for (; i + 1 < num_words; ++i)
    {
        m_words[i] ^= other.m_words[i];
    }

    if (extra_bits == 0)
    {
        m_words[num_words - 1] ^= other.m_words[num_words - 1];
    }
    else
    {
        m_words[num_words - 1] =
            GetLastWord<N>(m_words) ^ GetLastWord<N>(other.m_words);
    }

    return *this;
}

//*Operator ==
template <std::size_t N>
bool BitArray<N>::operator==(const BitArray& other) const
{
    constexpr std::size_t num_words = (N + BITS_IN_WORD - 1) / BITS_IN_WORD;
    std::size_t i = 0;

    for (; i + 1 < num_words; ++i)
    {
        if (m_words[i] != other.m_words[i])
        {
            return false;
        }
    }

    return GetLastWord<N>(m_words) == GetLastWord<N>(other.m_words);
}
// Operator !=
template <std::size_t N>
bool BitArray<N>::operator!=(const BitArray& other) const
{
    return !(*this == other);
}
// Operator << (const)
template <std::size_t N>
const BitArray<N> BitArray<N>::operator<<(std::size_t shift) const
{
    BitArray<N> result(*this);
    result <<= shift;
    return result;
}
// Operator >> (const)
template <std::size_t N>
const BitArray<N> BitArray<N>::operator>>(std::size_t shift) const
{
    BitArray<N> result(*this);
    result >>= shift;
    return result;
}

class Shifter
{
  public:
    Shifter(std::size_t shift) : m_shift(shift){};

    std::size_t operator()(std::size_t& a, std::size_t& b)
    {
        if (m_shift == 0)
        {
            return a;
        }

        return (a << m_shift) | (b >> (BITS_IN_WORD - m_shift));
    }

  private:
    std::size_t m_shift;
};
// Operator <<=
template <std::size_t N>
BitArray<N>& BitArray<N>::operator<<=(std::size_t shift)
{
    constexpr std::size_t num_words = (N + BITS_IN_WORD - 1) / BITS_IN_WORD;
    constexpr std::size_t extra_bits = N % BITS_IN_WORD;
    constexpr std::size_t total_words = sizeof(m_words) / sizeof(m_words[0]);

    if (shift >= N)
    {
        if (shift != 0)
        {

            std::fill(std::begin(m_words), std::end(m_words), 0ULL);
        }
        return *this;
    }

    const std::size_t word_shift = shift / BITS_IN_WORD;
    const std::size_t bit_shift = shift % BITS_IN_WORD;

    if (word_shift > 0)
    {
        std::move_backward(std::begin(m_words),
                           std::begin(m_words) + num_words - word_shift,
                           std::begin(m_words) + num_words);
        std::fill(std::begin(m_words), std::begin(m_words) + word_shift, 0ULL);
    }

    if (num_words > 1)
    {
        std::reverse_iterator<std::size_t*> rbegin_active =
            std::rbegin(m_words) + (total_words - num_words);
        std::reverse_iterator<std::size_t*> rend_active =
            rbegin_active + num_words;

        std::transform(rbegin_active, rend_active - 1, rbegin_active + 1,
                       rbegin_active, Shifter(bit_shift));
        m_words[0] <<= bit_shift;
    }
    else if (bit_shift != 0)
    {
        m_words[0] <<= bit_shift;
    }

    if (extra_bits != 0)
    {
        const std::size_t mask = (1ULL << extra_bits) - 1;
        m_words[num_words - 1] &= mask;
    }
    std::fill(std::begin(m_words) + num_words, std::end(m_words), 0ULL);

    return *this;
}
// Operator >>=
template <std::size_t N>
BitArray<N>& BitArray<N>::operator>>=(std::size_t shift)
{
    if (shift >= N)
    {
        if (shift != 0)
        {
            Set(false);
        }
        return *this;
    }

    std::size_t i = 0;
    for (; i + shift < N; ++i)
    {
        Set(i, Get(i + shift));
    }
    for (; i < N; ++i)
    {
        Set(i, false);
    }

    return *this;
}

// Bit Array Member Functions
// ================================================
// Set()
template <std::size_t N> BitArray<N>& BitArray<N>::Set(bool value)
{
    const std::size_t fill_value =
        value ? std::numeric_limits<std::size_t>::max() : 0ULL;
    std::fill(
        std::begin(m_words), std::end(m_words),
        fill_value); // TODO: dont change bits that arent part of the bitarray

    return *this;
}

// Set(pos, value) may throw std::out_of_range
template <std::size_t N>
BitArray<N>& BitArray<N>::Set(std::size_t pos, bool value)
{
    RangeCheck(pos, N);
    const std::size_t word_index = pos / BITS_IN_WORD;
    const std::size_t bit_index = pos % BITS_IN_WORD;

    m_words[word_index] = (m_words[word_index] & ~(1ULL << bit_index)) |
                          ((unsigned long long)(value & 1) << bit_index);

    return *this;
}

// Reset()
template <std::size_t N> BitArray<N>& BitArray<N>::Reset()
{
    return Set(false);
}

// Reset(pos) may throw std::out_of_range
template <std::size_t N> BitArray<N>& BitArray<N>::Reset(std::size_t pos)
{
    RangeCheck(pos, N);

    return Set(pos, false);
}

// Get(pos) may throw std::out_of_range
template <std::size_t N> bool BitArray<N>::Get(std::size_t pos) const
{
    RangeCheck(pos, N);

    const std::size_t word_index = pos / BITS_IN_WORD;
    const std::size_t bit_index = pos % BITS_IN_WORD;

    return m_words[word_index] & (1ULL << bit_index);
}

// Flip()
template <std::size_t N> BitArray<N>& BitArray<N>::Flip()
{

    std::for_each(std::begin(m_words), std::end(m_words),
                  [](std::size_t& word) { word = ~word; });

    constexpr std::size_t num_words = (N + BITS_IN_WORD - 1) / BITS_IN_WORD;
    constexpr std::size_t extra_bits = N % BITS_IN_WORD;
    if (extra_bits != 0)
    {
        std::size_t mask = (1ULL << extra_bits) - 1;
        m_words[num_words - 1] &= mask;
    }

    return *this;
}

// Flip(pos) may throw std::out_of_range
template <std::size_t N> BitArray<N>& BitArray<N>::Flip(std::size_t pos)
{
    RangeCheck(pos, N);

    return Set(pos, !Get(pos));
}

template <std::size_t N> std::size_t BitArray<N>::Count() const
{
    static const unsigned char BitCountTable[UCHAR_MAX + 1] = {B6(0), B6(1),
                                                               B6(1), B6(2)};
    constexpr std::size_t num_words = (N + BITS_IN_WORD - 1) / BITS_IN_WORD;
    constexpr std::size_t extra_bits = N % BITS_IN_WORD;
    std::size_t count_bits = 0;

    std::for_each(std::begin(m_words), std::end(m_words) - 1,
                  CountHelper(count_bits, BitCountTable));

    if (extra_bits != 0)
    {
        std::size_t last_word = m_words[num_words - 1];
        const std::size_t last_mask = (1ULL << extra_bits) - 1;
        const std::size_t last_word_masked = last_word & last_mask;
        last_word = last_word_masked;
        while (last_word != 0)
        {
            count_bits += BitCountTable[last_word & 0xFF];
            last_word >>= CHAR_BIT;
        }
    }

    return count_bits;
}

template <std::size_t N>
std::string BitArray<N>::ToString(char zero, char one) const
{
    std::string result;
    result.reserve(N);

    for (std::size_t i = N; i > 0; --i)
    {
        result.push_back(Get(i - 1) ? one : zero);
    }

    return result;
}


} // namespace ilrd

#endif /* _ILRD_BITARRAY_HPP */
