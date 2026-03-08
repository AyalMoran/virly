#ifndef DIRECTORY_HPP
#define DIRECTORY_HPP

#include "ifselement.hpp"

#include <vector>

class Directory : public IFSElement
{
  public:
    Directory& operator=(const Directory& other);
    explicit Directory(const std::string& name);
    virtual ~Directory();

    void Add(IFSElement* element);

    virtual void Print() const;
    virtual IFSElement* clone() const;

    std::vector<IFSElement*> m_contents;

  protected:
    Directory(const Directory& other);
    void Clear();
};

#endif // DIRECTORY_HPP
