#ifndef ILRD_FACTORY_HPP
#define ILRD_FACTORY_HPP

#include <functional>  // std::function
#include <map>         // std::map
#include <memory>      // std::unique_ptr
#include <stdexcept>   // std::runtime_error
#include <utility>     // std::move

namespace ilrd
{

template <typename Base, typename Key, typename... CtorArgs>
class Factory
{
  public:
    using ProductPtr = std::unique_ptr<Base>;
    using Creator = std::function<ProductPtr(CtorArgs...)>;

    class FactoryException : public std::runtime_error
    {
      public:
        explicit FactoryException(const char* msg)
            : std::runtime_error(msg)
        {
        }
    };

    class DuplicateKeyException : public FactoryException
    {
      public:
        DuplicateKeyException()
            : FactoryException("Factory::Add failed: key already exists")
        {
        }
    };

    class KeyNotFoundException : public FactoryException
    {
      public:
        KeyNotFoundException()
            : FactoryException("Factory::Create failed: key not found")
        {
        }
    };

    void Add(const Key& key, Creator creator)
    {
        if (!m_creators.insert(std::make_pair(key, std::move(creator))).second)
        {
            throw DuplicateKeyException();
        }
    }

    ProductPtr Create(const Key& key, CtorArgs... args) const
    {
        typename CreatorMap::const_iterator it = m_creators.find(key);

        if (m_creators.end() == it)
        {
            throw KeyNotFoundException();
        }

        return (it->second)(std::forward<CtorArgs>(args)...);
    }

  private:
    using CreatorMap = std::map<Key, Creator>;
    CreatorMap m_creators;
};

} // namespace ilrd

#endif // ILRD_FACTORY_HPP
