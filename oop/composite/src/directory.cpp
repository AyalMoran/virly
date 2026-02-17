#include "directory.hpp"

#include <iostream>
const char* TABS = "                ";
Directory::Directory(const std::string& name) : IFSElement(name), m_contents()
{
}

Directory::Directory(const Directory& other)
    : IFSElement(other.m_name), m_contents()
{
    std::vector<IFSElement*>::const_iterator it = other.m_contents.begin();
    std::vector<IFSElement*>::const_iterator end = other.m_contents.end();
    for (; it != end; ++it)
    {
        m_contents.push_back((*it)->clone());
    }
}

Directory& Directory::operator=(const Directory& other)
{
    if (this == &other)
    {
        return *this;
    }

    m_name = other.m_name;
    Clear();

    std::vector<IFSElement*>::const_iterator it = other.m_contents.begin();
    std::vector<IFSElement*>::const_iterator end = other.m_contents.end();
    for (; it != end; ++it)
    {
        m_contents.push_back((*it)->clone());
    }

    return *this;
}

Directory::~Directory()
{
    Clear();
}

void Directory::Add(IFSElement* element)
{
    m_contents.push_back(element);
}

void Directory::Print() const
{
    static int count = 0;

    count += 1;

    std::cout << "Directory: " << m_name << '\n';

    std::vector<IFSElement*>::const_iterator it = m_contents.begin();
    std::vector<IFSElement*>::const_iterator end = m_contents.end();
    for (; it != end; ++it)
    {
        for (int i = 0; i < count; ++i)
        {
            std::cout << TABS;
        }
        (*it)->Print();
    }

    count -= 1;
}

IFSElement* Directory::clone() const
{
    return new Directory(*this);
}

void Directory::Clear()
{
    std::vector<IFSElement*>::iterator it = m_contents.begin();
    std::vector<IFSElement*>::iterator end = m_contents.end();
    for (; it != end; ++it)
    {
        delete *it;
    }
    m_contents.clear();
}
