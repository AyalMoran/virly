/*************************************
 * RCString.cpp
 * Author: Ayal Moran
 * Reviewer: Yehuda F
 * Date: 27-01-2026
 */
#include "RCString.hpp"
#include <cstdlib>
#include <cstring>

#define OFFSETOF(type, member) ((size_t) & ((type*)0)->member)

namespace ilrd
{

RCString::State* RCString::CreateState(const char* cstr)
{
    size_t len = std::strlen(cstr);
    size_t offset = OFFSETOF(State, m_cstr);
    size_t total_size = offset + len + 1;

    char* raw_memory = static_cast<char*>(new char[total_size]);
    State* state = reinterpret_cast<State*>(raw_memory);

    state->m_ref_count = 1;

    std::memcpy(state->m_cstr, cstr, len + 1);

    return state;
}

void RCString::DestroyState(State* state)
{
    if (state)
    {
        delete (state);
    }
}

RCString::RCString(const char* cstr) : m_state(CreateState(cstr))
{
}

RCString::RCString(const RCString& other) : m_state(other.m_state)
{
    if (m_state)
    {
        ++m_state->m_ref_count;
    }
}

RCString::~RCString()
{
    if (m_state)
    {
        --m_state->m_ref_count;
        if (m_state->m_ref_count == 0)
        {
            DestroyState(m_state);
        }
    }
}

RCString& RCString::operator=(const RCString& other)
{
    if (this == &other)
    {
        return *this;
    }

    if (m_state)
    {
        --m_state->m_ref_count;
        if (0 == m_state->m_ref_count)
        {
            DestroyState(m_state);
        }
    }

    m_state = other.m_state;
    if (m_state)
    {
        ++m_state->m_ref_count;
    }

    return *this;
}

void RCString::Detach()
{
    if (m_state && m_state->m_ref_count > 1)
    {
        State* new_state = CreateState(ToCStr());
        --m_state->m_ref_count;
        m_state = new_state;
    }
}

char RCString::operator[](size_t index) const
{
    return m_state->m_cstr[index];
}

RCString::Proxy RCString::operator[](size_t index)
{
    return Proxy(*this, index);
}

RCString::Proxy::Proxy(RCString& str, size_t index) : m_str(str), m_index(index)
{
}

RCString::Proxy& RCString::Proxy::operator=(char c)
{
    m_str.Detach();
    m_str.m_state->m_cstr[m_index] = c;
    return *this;
}

RCString::Proxy::operator char() const
{
    return m_str.m_state->m_cstr[m_index];
}

} // namespace ilrd
