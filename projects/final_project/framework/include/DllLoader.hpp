/**************************************************************
 * File    : DllLoader.hpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    : 2026-03-22
 **************************************************************/
/**
 * @file DllLoader.hpp
 * @brief Declares a shared-object loader used by the plugin framework.
 */
#ifndef ILRD_DLLLOADER_HPP
#define ILRD_DLLLOADER_HPP

#include <cstddef> // std::size_t
#include <string>  // std::string

namespace ilrd
{

/**
 * @brief Loads and tracks shared objects for the running process.
 *
 * The loader remembers which paths were already loaded so repeated requests do
 * not load the same plugin twice.
 */
class DllLoader
{
  public:
    /**
     * @brief Creates an empty loader instance.
     */
    DllLoader();

    /**
     * @brief Unloads tracked resources owned by the loader implementation.
     */
    ~DllLoader();

    DllLoader(const DllLoader&) = delete;
    DllLoader& operator=(const DllLoader&) = delete;

    /**
     * @brief Loads a shared object from disk.
     * @param file_path_name Path to the `.so` file to load.
     */
    void LoadSharedObject(const std::string& file_path_name);

    /**
     * @brief Convenience call-through to LoadSharedObject().
     * @param file_path_name Path to the `.so` file to load.
     */
    void operator()(const std::string& file_path_name);

    /**
     * @brief Checks whether a shared object path is already loaded.
     * @param file_path_name Path to query.
     * @return `true` when the loader already tracks that path.
     */
    bool IsLoaded(const std::string& file_path_name) const;

    /**
     * @brief Returns the number of tracked shared objects.
     * @return Count of successfully loaded path entries.
     */
    std::size_t LoadedCount() const;

  private:
    struct Impl;
    Impl* m_impl;
};

} // namespace ilrd

#endif /* ILRD_DLLLOADER_HPP */
