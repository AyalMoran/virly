/**************************************************************
 * File    : DirMonitor.hpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    : 2026-03-22
 **************************************************************/
#ifndef ILRD_DIRMONITOR_HPP
#define ILRD_DIRMONITOR_HPP

#include <functional> // std::function
#include <string>     // std::string

namespace ilrd
{

class DirMonitor
{
  public:
    using Callback = std::function<void(const std::string&)>;

    explicit DirMonitor(const std::string& path_name);
    ~DirMonitor();

    DirMonitor(const DirMonitor&) = delete;
    DirMonitor& operator=(const DirMonitor&) = delete;

    void SubscribeAdded(Callback callback);
    void SubscribeDeleted(Callback callback);
    void SubscribeModified(Callback callback);

    const std::string& GetDirectory() const;

  private:
    struct Impl;
    Impl* m_impl;
};

} // namespace ilrd

#endif /* ILRD_DIRMONITOR_HPP */
