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
#include <cstdint>   // std::uint64_t
#include <iterator>  // std::begin, std::end
#include <limits>    // std::numeric_limits
#include <stdexcept> // std::out_of_range
#include <string>    // std::string

/*
TODO:

1. exception to_string specifically , our implementation
2. All STL algorithms should be with lambda or functors (50:50)
3. לעשות את הגודל שלהביט ארראי עם טיימפלייט
4. לא צריך לתמוך בפעולות בין ביטארראיי עם סייזים שונים
*/

/*Declarations for BitArray*/
namespace ilrd
{
// recursive defines for count()'s LUT building
#define B2(n) n, n + 1, n + 1, n + 2
#define B4(n) B2(n), B2(n + 1), B2(n + 1), B2(n + 2)
#define B6(n) B4(n), B4(n + 1), B4(n + 1), B4(n + 2)

const std::size_t DEFAULT_BIT_ARR_SIZE = 32;
const std::size_t BITS_IN_WORD = sizeof(uint64_t) * CHAR_BIT;

template <std::size_t N = DEFAULT_BIT_ARR_SIZE> class BitArray
{
    /*Private class for BitRef*/
  private:
    class BitRef
    {
      public:
        BitRef(std::uint64_t& word, std::uint64_t mask);
        BitRef& operator=(bool value);
        BitRef& operator=(const BitRef& other);
        operator bool() const;
        bool operator!() const;

      private:
        std::uint64_t& m_word;
        std::uint64_t m_mask;
    };

    /*Public class for BitArray*/
  public:
    /*Ctor*/
    BitArray(bool initial_all_value = false);
    // operators ================================================
    /*Operator [] for const*/
    bool operator[](std::size_t index) const;
    /*Operator [] for non-const*/
    BitRef operator[](std::size_t index);
    /*Operator |=*/
    BitArray& operator|=(const BitArray& other);
    /*Operator &=*/
    BitArray& operator&=(const BitArray& other);
    /*Operator ^=*/
    BitArray& operator^=(const BitArray& other);
    /*Operator ==*/
    bool operator==(const BitArray& other) const;
    /*Operator !=*/
    bool operator!=(const BitArray& other) const;
    /*Operator << (const)*/
    BitArray& operator<<(std::size_t shift) const;
    /*Operator >> (const)*/
    BitArray& operator>>(std::size_t shift) const;
    /*Operator <<=*/
    BitArray& operator<<=(std::size_t shift);
    /*Operator >>=*/
    BitArray& operator>>=(std::size_t shift);

    // Member Functions ================================================
    // Set()
    BitArray& Set(bool value);
    // Set(pos, value) may throw std::out_of_range
    BitArray& Set(std::size_t pos, bool value = true);
    // Reset()
    BitArray& Reset();
    // Reset(pos) may throw std::out_of_range
    BitArray& Reset(std::size_t pos);
    // Get(pos) may throw std::out_of_range
    bool Get(std::size_t pos) const;
    // Flip()
    BitArray& Flip();
    // Flip(pos) may throw std::out_of_range
    BitArray& Flip(std::size_t pos);

    // Count() throw()
    std::size_t Count() const;
    // ToString() may throw std::bad_alloc
    std::string ToString(char zero = '0', char one = '1') const;

  private:
    static void RangeCheck(std::size_t pos);

  private:
    std::uint64_t m_words[(N / (sizeof(std::uint64_t) * CHAR_BIT)) + 1];
};

// Member Functions ================================================

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
BitArray<N>::BitRef::BitRef(std::uint64_t& word, std::uint64_t mask)
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

template <std::size_t N>
typename BitArray<N>::BitRef BitArray<N>::operator[](std::size_t index)
{
    RangeCheck(index);
    const std::size_t word_index = index / kWordBits;
    const std::uint64_t mask = (1ULL << (index % kWordBits));
    return BitRef(m_words[word_index], mask);
}

template <std::size_t N> void BitArray<N>::RangeCheck(std::size_t index)
{
    if (index >= N)
    {
        throw std::out_of_range("BitArray index out of range");
    }
}

// Set()
template <std::size_t N> BitArray<N>& BitArray<N>::Set(bool value)
{
    const std::uint64_t fill_value =
        value ? std::numeric_limits<std::uint64_t>::max() : 0ULL;
    std::fill(std::begin(m_words), std::end(m_words), fill_value);

    return *this;
}

// Set(pos, value) may throw std::out_of_range
template <std::size_t N>
BitArray<N>& BitArray<N>::Set(std::size_t pos, bool value)
{
    if (pos >= N)
    {
        std::string throw_msg = "Bit position " + std::to_string(pos) +
                                " is out of range for BitArray<" +
                                std::to_string(N) + ">";
        throw std::out_of_range(throw_msg);
    }
    const std::size_t word_index = pos / (BITS_IN_WORD - 1);
    const std::size_t bit_index = pos % BITS_IN_WORD;

    m_words[word_index] = (m_words[word_index] & ~(1ULL << bit_index)) |
                          ((unsigned long long)(value & 1) << bit_index);

    return *this;
}

// Reset()
template <std::size_t N> BitArray<N>& BitArray<N>::Reset()
{
    return *Set(false);
}

// Reset(pos) may throw std::out_of_range
template <std::size_t N> BitArray<N>& BitArray<N>::Reset(std::size_t pos)
{
    if (pos >= N)
    {
        std::string throw_msg = "Bit position " + std::to_string(pos) +
                                " is out of range for BitArray<" +
                                std::to_string(N) + ">";
        throw std::out_of_range(throw_msg);
    }

    return Set(pos, false);
}

// Get(pos) may throw std::out_of_range
template <std::size_t N> bool BitArray<N>::Get(std::size_t pos) const
{
    if (pos >= N)
    {
        std::string throw_msg = "Bit position " + std::to_string(pos) +
                                " is out of range for BitArray<" +
                                std::to_string(N) + ">";
        throw std::out_of_range(throw_msg);
    }

    const std::size_t word_index = pos / (BITS_IN_WORD - 1);
    const std::size_t bit_index = pos % BITS_IN_WORD;

    return m_words[word_index] & (1ULL << bit_index);
}

// Flip()
template <std::size_t N> BitArray<N>& BitArray<N>::Flip()
{
    constexpr std::size_t num_words = (N + BITS_IN_WORD - 1) / BITS_IN_WORD;

    std::for_each(std::begin(m_words), std::begin(m_words) + num_words,
                  [](std::uint64_t& word) { word = ~word; });

    // Mask the last word if N does not fill the last word completely
    constexpr std::size_t extra_bits = N % BITS_IN_WORD;
    if (extra_bits != 0)
    {
        std::uint64_t mask = (1ULL << extra_bits) - 1;
        m_words[num_words - 1] &= mask;
    }

    return *this;
}

// Flip(pos) may throw std::out_of_range
template <std::size_t N> BitArray<N>& BitArray<N>::Flip(std::size_t pos)
{
    if (pos >= N)
    {
        std::string throw_msg = "Bit position " + std::to_string(pos) +
                                " is out of range for BitArray<" +
                                std::to_string(N) + ">";
        throw std::out_of_range(throw_msg);
    }

    return Set(pos, !Get(pos));
}
template <std::size_t N> std::size_t BitArray<N>::Count() const
{
    static const unsigned char BitCountTable[UCHAR_MAX + 1] = {B6(0), B6(1),
                                                               B6(1), B6(2)};

    constexpr std::size_t num_words = (N + BITS_IN_WORD - 1) / BITS_IN_WORD;
    std::size_t count_bits = 0;
    std::for_each(std::begin(m_words), std::begin(m_words) + num_words,
                  [&count_bits](std::uint64_t& word)
                  { count_bits += BitCountTable[word]; });

    if (N % BITS_IN_WORD != 0)
    {
        count_bits += BitCountTable[m_words[num_words - 1] &
                                    ((1ULL << (N % BITS_IN_WORD)) - 1)];
    }

    return count_bits;
}
} // namespace ilrd

#endif /* _ILRD_BITARRAY_HPP */
