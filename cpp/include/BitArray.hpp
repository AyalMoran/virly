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
  private:
    class BitRef
    {
      public:
        BitRef(std::uint64_t& word, std::uint64_t mask);
        BitRef& operator=(bool value);
        BitRef& operator=(const BitRef& other);

        operator bool() const;

      private:
        std::uint64_t& m_word;
        std::uint64_t m_mask;
    };

  public:
    BitArray();
    bool operator[](std::size_t index) const;
    BitRef operator[](std::size_t index);

  private:
    static void RangeCheck(std::size_t index);

  private:
    std::uint64_t m_array;
};
} // namespace ilrd

#endif /* _ILRD_BITARRAY_HPP */
