/**************************************************************
 * File    : Reactor.cpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    : 12-03-2026
 **************************************************************/

#include <algorithm>    // std::max
#include <cerrno>       // errno
#include <cstring>      // std::strerror
#include <stdexcept>    // std::logic_error
#include <sys/select.h> // select
#include <unistd.h>     // close

#include "Reactor.hpp"

namespace ilrd
{

namespace
{

bool IsReady(int fd, IListener::Mode mode, const fd_set& readSet,
             const fd_set& writeSet)
{
    return (IListener::READ == mode) ? (FD_ISSET(fd, &readSet) != 0)
                                     : (FD_ISSET(fd, &writeSet) != 0);
}

} // namespace

Reactor::Reactor(IListener& listener)
    : m_listener(listener), m_actions(), m_isRunning(false),
      m_stopRequested(false)
{
}

void Reactor::AddFd(int fd, IListener::Mode mode, const ActionFunc& proc)
{
    if (fd < 0)
    {
        throw std::invalid_argument("Reactor::AddFd() invalid fd");
    }

    if (!proc)
    {
        throw std::invalid_argument("Reactor::AddFd() empty callback");
    }

    m_actions[IListener::ModeAndFd(mode, fd)] = proc;
}

void Reactor::RemoveFd(int fd, IListener::Mode mode)
{
    m_actions.erase(IListener::ModeAndFd(mode, fd));
}

void Reactor::Run()
{
    if (m_isRunning)
    {
        throw std::logic_error("Reactor::Run() is already active");
    }

    m_isRunning = true;
    m_stopRequested = false;

    try
    {
        while (!m_stopRequested && !m_actions.empty())
        {
            const std::vector<IListener::ModeAndFd> descriptors =
                BuildDescriptorList(m_actions);
            const std::vector<IListener::ModeAndFd>& ready =
                m_listener.Listen(descriptors);

            for (std::size_t i = 0; i < ready.size() && !m_stopRequested; ++i)
            {
                ActionMap::iterator iter = m_actions.find(ready[i]);
                if (m_actions.end() == iter)
                {
                    continue;
                }

                ActionFunc callback = iter->second;
                callback(ready[i].second, ready[i].first);
            }
        }
    }
    catch (...)
    {
        m_isRunning = false;
        throw;
    }

    m_isRunning = false;
}

void Reactor::Stop()
{
    m_stopRequested = true;
}

bool Reactor::IsRunning() const
{
    return m_isRunning;
}

std::size_t Reactor::Size() const
{
    return m_actions.size();
}

std::size_t Reactor::ModeAndFdHash::operator()(
    const IListener::ModeAndFd& key) const
{
    return (static_cast<std::size_t>(key.first) << 24) ^
           static_cast<std::size_t>(key.second);
}

std::vector<IListener::ModeAndFd>
Reactor::BuildDescriptorList(const ActionMap& actions)
{
    std::vector<IListener::ModeAndFd> descriptors;
    descriptors.reserve(actions.size());

    for (ActionMap::const_iterator iter = actions.begin(); iter != actions.end();
         ++iter)
    {
        descriptors.push_back(iter->first);
    }

    return descriptors;
}

LinuxFdListener::LinuxFdListener() : m_readyDescriptors()
{
}

const std::vector<IListener::ModeAndFd>& LinuxFdListener::Listen(
    const std::vector<ModeAndFd>& descriptors)
{
    m_readyDescriptors.clear();
    if (descriptors.empty())
    {
        return m_readyDescriptors;
    }

    fd_set readSet;
    fd_set writeSet;
    FD_ZERO(&readSet);
    FD_ZERO(&writeSet);

    int maxFd = -1;
    for (std::size_t i = 0; i < descriptors.size(); ++i)
    {
        const int fd = descriptors[i].second;
        if (fd < 0)
        {
            throw std::invalid_argument("LinuxFdListener::Listen() invalid fd");
        }

        if (READ == descriptors[i].first)
        {
            FD_SET(fd, &readSet);
        }
        else if (WRITE == descriptors[i].first)
        {
            FD_SET(fd, &writeSet);
        }
        else
        {
            throw std::invalid_argument(
                "LinuxFdListener::Listen() invalid mode");
        }

        maxFd = std::max(maxFd, fd);
    }

    for (;;)
    {
        fd_set readSetCopy = readSet;
        fd_set writeSetCopy = writeSet;
        const int readyCount =
            select(maxFd + 1, &readSetCopy, &writeSetCopy, nullptr, nullptr);

        if (readyCount >= 0)
        {
            for (std::size_t i = 0; i < descriptors.size(); ++i)
            {
                if (IsReady(descriptors[i].second, descriptors[i].first,
                            readSetCopy, writeSetCopy))
                {
                    m_readyDescriptors.push_back(descriptors[i]);
                }
            }

            return m_readyDescriptors;
        }

        if (EINTR != errno)
        {
            throw std::runtime_error(std::strerror(errno));
        }
    }
}

} // namespace ilrd
