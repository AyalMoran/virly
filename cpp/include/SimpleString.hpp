
#ifndef ILRD_RD175_STRING_HPP
#define ILRD_RD175_STRING_HPP
#include <iostream>
#include <cstddef>
#include <cstring>
#include <cassert>

class String
{
  public:
    //Ctor
    String(const char* cstr = "");
    //CCtor
    String(const String& other);
    //Dtor
    ~String();
    //assignment = operator
    String& operator=(const String& other);
    
    size_t Length() const;
    inline const char* Cstr() const; 

  private:
    char* m_cstr;
};

inline const char* String::Cstr() const
{
    return m_cstr;
}

inline char* StrDup(const char* other){
  std::size_t other_size = strlen(other) + 1;
  char* buffer =  new char[other_size]; 
  return static_cast<char*>(std::memcpy(buffer, other, other_size));
}

std::ostream& operator<<(std::ostream& os, const String& str);

#endif /* ILRD_RD175_STRING_HPP */