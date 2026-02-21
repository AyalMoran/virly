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
BitArray::BitArray() : m_array(0)
{
}

BitArray::ProxyBit::ProxyBit(std::uint64_t& word, std::uint64_t mask)
    : m_word(word), m_mask(mask)
{
}

BitArray::ProxyBit::operator bool() const
{
    return (m_word & m_mask) != 0ULL;
}

BitArray::ProxyBit& BitArray::ProxyBit::operator=(bool value)
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

BitArray::ProxyBit& BitArray::ProxyBit::operator=(const ProxyBit& other)
{
    return (*this = static_cast<bool>(other));
}

BitArray::ProxyBit BitArray::operator[](std::size_t index)
{
    RangeCheck(index);
    const std::uint64_t mask = (1ULL << index);
    return ProxyBit(m_array, mask);
}

void BitArray::RangeCheck(std::size_t index)
{
    if (index >= static_cast<std::size_t>(CHAR_BIT * sizeof(std::uint64_t)))
    {
        throw std::out_of_range("BitArray index out of range");
    }
}
} // namespace ilrd


