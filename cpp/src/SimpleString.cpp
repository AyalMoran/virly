#include <cstring>
#include <iostream>
#include <cassert>

#include "SimpleString.hpp"

String::String(const char* cstr) : m_cstr(StrDup(cstr))
{
    // empty
}

String::~String()
{
    delete[] this->m_cstr;
}

String::String(const String& other) : m_cstr(StrDup(other.m_cstr))
{
    // empty
}

String& String::operator=(const String& other)
{
    char* temp = StrDup(other.m_cstr);
    delete[] this->m_cstr;
    this->m_cstr = temp;
    
    return *this;
}

size_t String::Length() const
{
    assert(this->Cstr());
    return strlen(this->m_cstr);
}

std::ostream& operator<<(std::ostream& os, const String& str) 
{
    os << (str).Cstr();
    return os;
}
