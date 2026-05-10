/**************************************************************
 * File    : DllLoader.cpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    : 2026-03-22
 **************************************************************/

#include <dlfcn.h>        // dlopen, dlclose, dlerror
#include <filesystem>     // std::filesystem
#include <mutex>          // std::mutex
#include <stdexcept>      // std::runtime_error
#include <unordered_map>  // std::unordered_map
#include <utility>        // std::make_pair

#include "DllLoader.hpp"
#include "DebugLogger.hpp"

namespace ilrd
{

struct DllLoader::Impl
{
    Impl() : m_handles(), m_mutex()
    {
    }

    std::unordered_map<std::string, void*> m_handles;
    mutable std::mutex m_mutex;
};

DllLoader::DllLoader() : m_impl(new Impl())
{
}

DllLoader::~DllLoader()
{
    for (std::unordered_map<std::string, void*>::value_type& entry :
         m_impl->m_handles)
    {
        if (entry.second != nullptr)
        {
            dlclose(entry.second);
        }
    }

    delete m_impl;
}

void DllLoader::LoadSharedObject(const std::string& file_path_name)
{                                                                                                                                                                 
    const std::string canonical_path =
        std::filesystem::canonical(file_path_name).string();

    std::lock_guard<std::mutex> lock(m_impl->m_mutex);
    if (m_impl->m_handles.find(canonical_path) != m_impl->m_handles.end())
    {
        ILRD_DEBUG_LOG("DllLoader skipped already loaded object " + canonical_path);
        return;
    }

    dlerror();
    void* handle = dlopen(canonical_path.c_str(), RTLD_NOW | RTLD_LOCAL);
    if (handle == nullptr)
    {
        throw std::runtime_error(dlerror());
    }

    m_impl->m_handles.insert(std::make_pair(canonical_path, handle));
    ILRD_DEBUG_LOG("DllLoader loaded shared object " + canonical_path);
}

void DllLoader::operator()(const std::string& file_path_name)
{
    LoadSharedObject(file_path_name);
}

bool DllLoader::IsLoaded(const std::string& file_path_name) const
{
    const std::string canonical_path =
        std::filesystem::weakly_canonical(file_path_name).string();

    std::lock_guard<std::mutex> lock(m_impl->m_mutex);
    return m_impl->m_handles.find(canonical_path) != m_impl->m_handles.end();
}

std::size_t DllLoader::LoadedCount() const
{
    std::lock_guard<std::mutex> lock(m_impl->m_mutex);
    return m_impl->m_handles.size();
}

} // namespace ilrd
