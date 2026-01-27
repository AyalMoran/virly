/*************************************
 * RCString.hpp
 * Author: Ayal Moran
 * Reviewer: Yehuda F
 * Date: 27-01-2026
 */
#ifndef ILRD_RCSTRING_HPP
#define ILRD_RCSTRING_HPP

#include <cstring>
#include <cstdlib>
#include <iostream>

namespace ilrd
{

class RCString;
class Proxy;

inline std::ostream& operator<<(std::ostream& os, const RCString& str);
inline bool operator==(const RCString& lhs_, const RCString& rhs_);
inline bool operator!=(const RCString& lhs_, const RCString& rhs_);
inline bool operator<(const RCString& lhs_, const RCString& rhs_);
inline bool operator>(const RCString& lhs_, const RCString& rhs_);

class RCString
{
  public:
    RCString(const char* cstr = "");
    RCString(const RCString& other);
    ~RCString();

    RCString& operator=(const RCString& other);

    inline const char* ToCStr() const;
    inline size_t Length() const;

    class Proxy
    {
      public:
        Proxy(RCString& str, size_t index);
        Proxy& operator=(char c);
        operator char() const;

      private:
        RCString& m_str;
        size_t m_index;
    };

    char operator[](size_t index) const;
    Proxy operator[](size_t index);

  private:
    struct State
    {
        size_t m_ref_count;
        char m_cstr[1];
    };
    State* m_state;

    void Detach();
    static State* CreateState(const char* cstr);
    static void DestroyState(State* state);
};

inline const char* RCString::ToCStr() const
{
    return m_state->m_cstr;
}

inline size_t RCString::Length() const
{
    return std::strlen(m_state->m_cstr);
}

inline bool operator==(const RCString& lhs_, const RCString& rhs_)
{
    return std::strcmp(lhs_.ToCStr(), rhs_.ToCStr()) == 0;
}

inline bool operator!=(const RCString& lhs_, const RCString& rhs_)
{
    return !(lhs_ == rhs_);
}

inline bool operator<(const RCString& lhs_, const RCString& rhs_)
{
    return std::strcmp(lhs_.ToCStr(), rhs_.ToCStr()) < 0;
}

inline bool operator>(const RCString& lhs_, const RCString& rhs_)
{
    return std::strcmp(lhs_.ToCStr(), rhs_.ToCStr()) > 0;
}

std::ostream& operator<<(std::ostream& os, const RCString& str)
{
    os << str.ToCStr();
    return os;
}
} // namespace ilrd

#endif // ILRD_RCSTRING_HPP

