/*************************************
 * File: Factory.hpp
 * Author: Ayal Moran
 * Reviewer:
 * Date: 06-03-2026
 *************************************/
/**
 * @file Factory.hpp
 * @brief Defines a generic key-to-creator object factory.
 */

#ifndef ILRD_FACTORY_HPP
#define ILRD_FACTORY_HPP

#include <functional>    // std::function
#include <memory>        // std::unique_ptr
#include <stdexcept>     // std::runtime_error
#include <unordered_map> // std::unordered_map
#include <utility>       // std::forward, std::move

namespace ilrd
{

/**
 * @brief Maps keys to creator callables that construct polymorphic objects.
 * @tparam Base Base type returned by the factory.
 * @tparam Key Key type used to select a creator.
 * @tparam CtorArgs Argument pack forwarded to the creator callable.
 */
template <typename Base, typename Key, typename... CtorArgs>
class Factory
{
  public:
    /**
     * @brief Owning pointer returned for created products.
     */
    using ProductPtr = std::unique_ptr<Base>;

    /**
     * @brief Creator callable stored for each key.
     */
    using Creator = std::function<ProductPtr(CtorArgs...)>;

    /**
     * @brief Base exception type for factory lookup and registration failures.
     */
    class FactoryException : public std::runtime_error
    {
      public:
        explicit FactoryException(const char* msg)
            : std::runtime_error(msg)
        {
        }
    };

    /**
     * @brief Thrown when Create() is called with an unknown key.
     */
    class KeyNotFoundException : public FactoryException
    {
      public:
        KeyNotFoundException()
            : FactoryException("Factory::Create failed: key not found")
        {
        }
    };

    /**
     * @brief Registers or replaces a creator for the given key.
     * @param key Key to associate with the creator.
     * @param creator Callable used to build a product for that key.
     */
    void Add(const Key& key, Creator creator)
    {
        m_creators[key] = std::move(creator);
    }

    /**
     * @brief Creates a product using the creator registered for `key`.
     * @param key Factory key to resolve.
     * @param args Arguments forwarded to the selected creator.
     * @return Newly created product instance.
     * @throws KeyNotFoundException If no creator is registered for `key`.
     */
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
    using CreatorMap = std::unordered_map<Key, Creator>;
    CreatorMap m_creators;
};

} // namespace ilrd

#endif // ILRD_FACTORY_HPP
