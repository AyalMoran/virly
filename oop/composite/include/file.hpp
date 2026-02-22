#ifndef FILE_HPP
#define FILE_HPP

#include "ifselement.hpp"

class File : public IFSElement
{
  public:
    explicit File(const std::string& name);
    virtual ~File();

    virtual void Print() const;
    virtual IFSElement* clone() const;
    File& operator=(const File& other);

  protected:
    File(const File& other);
};

#endif // FILE_HPP
