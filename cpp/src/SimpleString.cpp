#include <cstring>
#include <iostream>
#include <cassert>

#include "SimpleString.hpp"

String::String(const char* cstr) : m_cstr(new char[strlen(cstr) + 1])
{
    assert(cstr);
    strcpy(this->m_cstr, cstr);
}

String::~String()
{
    delete[] m_cstr;
}

String::String(const String& other) : m_cstr(new char[strlen(other.m_cstr) + 1])
{
    strcpy(m_cstr, other.m_cstr);
}

String& String::operator=(const String& other)
{
    if (this != &other)
    {
        delete[] m_cstr;
        m_cstr = new char[strlen(other.m_cstr) + 1];
        strcpy(m_cstr, other.m_cstr);
    }
    return *this;
}

char* String::Cstr()
{
    return m_cstr;
}

size_t String::Length()
{
    return strlen(this->m_cstr);
}

std::ostream& operator<<(std::ostream& os, const String& str) {
    os << const_cast<String&>(str).Cstr();
    return os;
}