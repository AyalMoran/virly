/**************************************************************
 * File    : DirMonitor.hpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    : 2026-03-22
 **************************************************************/
/**
 * @file DirMonitor.hpp
 * @brief Declares a directory watcher that notifies on file-system changes.
 */
#ifndef ILRD_DIRMONITOR_HPP
#define ILRD_DIRMONITOR_HPP

#include <functional> // std::function
#include <string>     // std::string

namespace ilrd
{

/**
 * @brief Monitors a directory and invokes callbacks for file events.
 *
 * The monitor owns the underlying OS watcher implementation. Callbacks receive
 * the affected path name as reported by the implementation.
 */
class DirMonitor
{
  public:
    /**
     * @brief Callback signature used for directory change notifications.
     */
    using Callback = std::function<void(const std::string&)>;

    /**
     * @brief Starts monitoring the supplied directory.
     * @param path_name Directory path to monitor.
     */
    explicit DirMonitor(const std::string& path_name);

    /**
     * @brief Stops monitoring and releases OS resources.
     */
    ~DirMonitor();

    DirMonitor(const DirMonitor&) = delete;
    DirMonitor& operator=(const DirMonitor&) = delete;

    /**
     * @brief Subscribes to file creation events.
     * @param callback Invoked with the path of the added entry.
     */
    void SubscribeAdded(Callback callback);

    /**
     * @brief Subscribes to file deletion events.
     * @param callback Invoked with the path of the removed entry.
     */
    void SubscribeDeleted(Callback callback);

    /**
     * @brief Subscribes to file modification events.
     * @param callback Invoked with the path of the modified entry.
     */
    void SubscribeModified(Callback callback);

    /**
     * @brief Returns the monitored directory path.
     * @return Directory path supplied at construction time.
     */
    const std::string& GetDirectory() const;

  private:
    struct Impl;
    Impl* m_impl;
};

} // namespace ilrd

#endif /* ILRD_DIRMONITOR_HPP */
