/**************************************************************
 * File    : DirMonitor.cpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    : 2026-03-22
 **************************************************************/

#include <array>          // std::array
#include <cerrno>         // errno, EINTR, EAGAIN
#include <filesystem>     // std::filesystem
#include <mutex>          // std::mutex
#include <poll.h>         // poll
#include <string>         // std::string
#include <system_error>   // std::system_error
#include <thread>         // std::thread
#include <unistd.h>       // close, pipe, read, write
#include <vector>         // std::vector
#include <sys/inotify.h>  // inotify_event, inotify_*

#include "DirMonitor.hpp"

namespace ilrd
{

namespace
{

const uint32_t kWatchMask =
    IN_CREATE | IN_DELETE | IN_MODIFY | IN_CLOSE_WRITE | IN_MOVED_FROM |
    IN_MOVED_TO;

bool IsRegularFileEvent(const inotify_event& event)
{
    return 0 == (event.mask & IN_ISDIR);
}

} // namespace

struct DirMonitor::Impl
{
    explicit Impl(const std::string& path_name)
        : m_directory(std::filesystem::canonical(path_name).string()),
          m_inotifyFd(inotify_init1(IN_NONBLOCK | IN_CLOEXEC)),
          m_watchDescriptor(-1),
          m_stopPipe{{-1, -1}},
          m_callbacksMutex(),
          m_addedCallbacks(),
          m_deletedCallbacks(),
          m_modifiedCallbacks(),
          m_thread()
    {
        if (m_inotifyFd == -1)
        {
            throw std::system_error(errno, std::generic_category(),
                                    "inotify_init1 failed");
        }

        if (pipe(m_stopPipe.data()) != 0)
        {
            const int saved_errno = errno;
            close(m_inotifyFd);
            throw std::system_error(saved_errno, std::generic_category(),
                                    "pipe failed");
        }

        m_watchDescriptor = inotify_add_watch(m_inotifyFd, m_directory.c_str(),
                                              kWatchMask);
        if (m_watchDescriptor == -1)
        {
            const int saved_errno = errno;
            close(m_stopPipe[0]);
            close(m_stopPipe[1]);
            close(m_inotifyFd);
            throw std::system_error(saved_errno, std::generic_category(),
                                    "inotify_add_watch failed");
        }

        m_thread = std::thread(&Impl::MonitorLoop, this);
    }

    ~Impl()
    {
        if (m_stopPipe[1] != -1)
        {
            const char stop_byte = 'x';
            const ssize_t bytes_written =
                write(m_stopPipe[1], &stop_byte, sizeof(stop_byte));
            (void)bytes_written;
        }

        if (m_thread.joinable())
        {
            m_thread.join();
        }

        if (m_watchDescriptor != -1)
        {
            inotify_rm_watch(m_inotifyFd, m_watchDescriptor);
        }

        if (m_stopPipe[0] != -1)
        {
            close(m_stopPipe[0]);
        }

        if (m_stopPipe[1] != -1)
        {
            close(m_stopPipe[1]);
        }

        if (m_inotifyFd != -1)
        {
            close(m_inotifyFd);
        }
    }

    void SubscribeAdded(DirMonitor::Callback callback)
    {
        std::lock_guard<std::mutex> lock(m_callbacksMutex);
        m_addedCallbacks.push_back(std::move(callback));
    }

    void SubscribeDeleted(DirMonitor::Callback callback)
    {
        std::lock_guard<std::mutex> lock(m_callbacksMutex);
        m_deletedCallbacks.push_back(std::move(callback));
    }

    void SubscribeModified(DirMonitor::Callback callback)
    {
        std::lock_guard<std::mutex> lock(m_callbacksMutex);
        m_modifiedCallbacks.push_back(std::move(callback));
    }

    void MonitorLoop()
    {
        std::array<char, 4096> buffer = {};
        std::array<pollfd, 2> fds = {
            pollfd{m_inotifyFd, POLLIN, 0},
            pollfd{m_stopPipe[0], POLLIN, 0}};

        while (true)
        {
            const int poll_rc = poll(fds.data(), fds.size(), -1);
            if (poll_rc < 0)
            {
                if (errno == EINTR)
                {
                    continue;
                }
                return;
            }

            if (0 != (fds[1].revents & POLLIN))
            {
                return;
            }

            if (0 == (fds[0].revents & POLLIN))
            {
                continue;
            }

            const ssize_t bytes_read =
                read(m_inotifyFd, buffer.data(), buffer.size());
            if (bytes_read <= 0)
            {
                if (bytes_read < 0 && errno == EAGAIN)
                {
                    continue;
                }
                return;
            }

            for (std::size_t offset = 0;
                 offset < static_cast<std::size_t>(bytes_read);)
            {
                const inotify_event* event =
                    reinterpret_cast<const inotify_event*>(buffer.data() +
                                                           offset);
                HandleEvent(*event);
                offset += sizeof(inotify_event) + event->len;
            }
        }
    }

    void HandleEvent(const inotify_event& event)
    {
        if (!IsRegularFileEvent(event) || 0 == event.len)
        {
            return;
        }

        const std::string full_path =
            (std::filesystem::path(m_directory) / event.name).string();

        if (0 != (event.mask & (IN_CREATE | IN_MOVED_TO)))
        {
            NotifyAdded(full_path);
        }

        if (0 != (event.mask & (IN_DELETE | IN_MOVED_FROM)))
        {
            NotifyDeleted(full_path);
        }

        if (0 != (event.mask & (IN_MODIFY | IN_CLOSE_WRITE)))
        {
            NotifyModified(full_path);
        }
    }

    void NotifyAdded(const std::string& full_path)
    {
        NotifySnapshot(m_addedCallbacks, full_path);
    }

    void NotifyDeleted(const std::string& full_path)
    {
        NotifySnapshot(m_deletedCallbacks, full_path);
    }

    void NotifyModified(const std::string& full_path)
    {
        NotifySnapshot(m_modifiedCallbacks, full_path);
    }

    void NotifySnapshot(const std::vector<DirMonitor::Callback>& source,
                        const std::string& full_path)
    {
        std::vector<DirMonitor::Callback> snapshot;
        {
            std::lock_guard<std::mutex> lock(m_callbacksMutex);
            snapshot = source;
        }

        for (std::vector<DirMonitor::Callback>::const_iterator it =
                 snapshot.begin();
             it != snapshot.end(); ++it)
        {
            (*it)(full_path);
        }
    }

    std::string m_directory;
    int m_inotifyFd;
    int m_watchDescriptor;
    std::array<int, 2> m_stopPipe;
    std::mutex m_callbacksMutex;
    std::vector<DirMonitor::Callback> m_addedCallbacks;
    std::vector<DirMonitor::Callback> m_deletedCallbacks;
    std::vector<DirMonitor::Callback> m_modifiedCallbacks;
    std::thread m_thread;
};

DirMonitor::DirMonitor(const std::string& path_name) : m_impl(new Impl(path_name))
{
}

DirMonitor::~DirMonitor()
{
    delete m_impl;
}

void DirMonitor::SubscribeAdded(Callback callback)
{
    m_impl->SubscribeAdded(std::move(callback));
}

void DirMonitor::SubscribeDeleted(Callback callback)
{
    m_impl->SubscribeDeleted(std::move(callback));
}

void DirMonitor::SubscribeModified(Callback callback)
{
    m_impl->SubscribeModified(std::move(callback));
}

const std::string& DirMonitor::GetDirectory() const
{
    return m_impl->m_directory;
}

} // namespace ilrd
