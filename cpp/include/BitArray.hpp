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
//*----------------------------- MACROS and Constants--------------------------

// recursive defines for count()'s LUT building
#define B2(n) n, n + 1, n + 1, n + 2
#define B4(n) B2(n), B2(n + 1), B2(n + 1), B2(n + 2)
#define B6(n) B4(n), B4(n + 1), B4(n + 1), B4(n + 2)

const std::size_t DEFAULT_BIT_ARR_SIZE = 32;
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
    /*Private class for BitRef*/
  private:
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

    /*Public class for BitArray*/
  public:
    /*Ctor*/
    BitArray(bool initial_all_value = false);
    BitArray(const BitArray& other);

    //* operators ================================================
    /*Operator = for non-const*/
    BitArray& operator=(const BitArray& other);
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
    /*Operator <<=*/
    BitArray& operator<<=(std::size_t shift);
    /*Operator >>=*/
    BitArray& operator>>=(std::size_t shift);
    // Operator << (const)
    const BitArray operator<<(std::size_t shift) const;
    // Operator >> (const)
    const BitArray operator>>(std::size_t shift) const;

    //* Member Functions ================================================
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
    RangeCheck(index);
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
    RangeCheck(pos);
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
    RangeCheck(pos);

    return Set(pos, false);
}

// Get(pos) may throw std::out_of_range
template <std::size_t N> bool BitArray<N>::Get(std::size_t pos) const
{
    RangeCheck(pos);

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
    RangeCheck(pos);

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

// static functions ================================================
template <std::size_t N> void BitArray<N>::RangeCheck(std::size_t pos)
{
    if (pos >= N)
    {
        std::string throw_msg = "Bit position " + std::to_string(pos) +
                                " is out of range for BitArray<" +
                                std::to_string(N) + ">";
        throw std::out_of_range(throw_msg);
    }
}
} // namespace ilrd

#endif /* _ILRD_BITARRAY_HPP */
