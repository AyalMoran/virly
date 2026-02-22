#ifndef IFSELEMENT_HPP
#define IFSELEMENT_HPP

#include <string>

class IFSElement
{
  public:
    explicit IFSElement(const std::string& name);
    virtual ~IFSElement();

    virtual void Print() const = 0;
    virtual IFSElement* clone() const = 0;

  protected:
    std::string m_name;
};

#endif // IFSELEMENT_HPP
