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
/*
TODO:

1. exception to_string specifically , our implementation
2. כל הפניות ל-STL עם FUNCTOR ו-lambda לעשות חציחצי
3. לעשות את הגודל שלהביט ארראי עם טיימפלייט
4. לא צריך לתמוך בפעולות בין ביטארראיי עם סייזים שונים
*/


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
