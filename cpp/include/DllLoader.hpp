/**************************************************************
 * File    : DllLoader.hpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    : 2026-03-22
 **************************************************************/
#ifndef ILRD_DLLLOADER_HPP
#define ILRD_DLLLOADER_HPP

#include <cstddef> // std::size_t
#include <string>  // std::string

namespace ilrd
{

class DllLoader
{
  public:
    DllLoader();
    ~DllLoader();

    DllLoader(const DllLoader&) = delete;
    DllLoader& operator=(const DllLoader&) = delete;

    void LoadSharedObject(const std::string& file_path_name);
    void operator()(const std::string& file_path_name);

    bool IsLoaded(const std::string& file_path_name) const;
    std::size_t LoadedCount() const;

  private:
    struct Impl;
    Impl* m_impl;
};

} // namespace ilrd

#endif /* ILRD_DLLLOADER_HPP */
