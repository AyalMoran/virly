/**************************************************************
 * File    : BitArray.hpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/
#ifndef _ILRD_BITARRAY_HPP
#define _ILRD_BITARRAY_HPP

#include <cstddef> // std::size_t
#include <cstdint> // std::uint64_t

/*Declarations for BitArray*/
namespace ilrd
{
class BitArray
{
  public:
    BitArray();
    
    class ProxyBit
    {
      public:
        ProxyBit(std::uint64_t& word, std::uint64_t mask);
        ProxyBit& operator=(bool value);
        ProxyBit& operator=(const ProxyBit& other);

        operator bool() const;

      private:
        std::uint64_t& m_word;
        std::uint64_t m_mask;
    };

    bool operator[](std::size_t index) const;
    ProxyBit operator[](std::size_t index);

  private:
    static void RangeCheck(std::size_t index);

  private:
    std::uint64_t m_array;
};
} // namespace ilrd

#endif /* _ILRD_BITARRAY_HPP */

