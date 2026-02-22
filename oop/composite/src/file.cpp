#include "file.hpp"

#include <iostream>

File::File(const std::string& name) : IFSElement(name)
{
}

File::~File()
{
}

void File::Print() const
{
    std::cout << "File: " << m_name << '\n';
}

IFSElement* File::clone() const
{
    return new File(*this);
}

File& File::operator=(const File& other)
{
    IFSElement::operator=(other);
    return *this;
}

File::File(const File& other) : IFSElement(other.m_name)
{
}
