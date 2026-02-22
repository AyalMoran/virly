/**************************************************************
 * File    : BitArray.cpp
 * Author  : Ayal Moran
 * Reviewer: 
 * Date    : 
**************************************************************/

/*============================ INCLUDES ============================*/

#include <cstdint> // std::uint64_t
#include <climits> // CHAR_BIT
#include <cstddef> // std::size_t
#include <stdexcept> // out_of_range

#include "BitArray.hpp"

/*========================== DEFINITIONS ===========================*/
#define TRUE  (1)
#define FALSE (0)
#define SUCCESS (0)
#define FAILURE (1)


namespace ilrd
{

// Default Ctor
template <std::size_t N>
BitArray<N>::BitArray() : m_words{}
{
}

template <std::size_t N>
BitArray<N>::BitRef::BitRef(std::uint64_t& word, std::uint64_t mask)
    : m_word(word), m_mask(mask)
{
}

template <std::size_t N>
BitArray<N>::BitRef::operator bool() const
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
typename BitArray<N>::BitRef& BitArray<N>::BitRef::operator=(const BitRef& other)
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

template <std::size_t N>
void BitArray<N>::RangeCheck(std::size_t index)
{
    if (index >= N)
    {
        throw std::out_of_range("BitArray index out of range");
    }
}

} // namespace ilrd


