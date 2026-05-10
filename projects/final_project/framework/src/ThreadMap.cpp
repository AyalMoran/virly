#include <utility>      // std::move
#include <mutex>        // std::mutex
#include <unordered_map> // std::unordered_map
#include <vector>       // std::vector
#include <condition_variable> // std::condition_variable

#include "ThreadMap.hpp" // ThreadMap

namespace ilrd
{

ThreadMap::ProxyValue::ProxyValue(ThreadMap& map, std::thread::id id)
    : m_map(map), m_id(std::move(id))
{
}

ThreadMap::ProxyValue& ThreadMap::ProxyValue::operator=(bool is_running)
{
    std::lock_guard<std::mutex> lock(m_map.m_mutex);
    m_map.m_map[m_id] = is_running;
    if (!is_running)
    {
        m_map.m_cv.notify_one();
    }
    return *this;
}

ThreadMap::ProxyValue::operator bool() const
{
    std::lock_guard<std::mutex> lock(m_map.m_mutex);
    std::unordered_map<std::thread::id, bool>::const_iterator it =
        m_map.m_map.find(m_id);

    return (it != m_map.m_map.end()) ? it->second : false;
}

ThreadMap::ProxyValue ThreadMap::operator[](const std::thread::id& id)
{
    return ProxyValue(*this, id);
}

ThreadMap::ThreadMap()
    : m_mutex(), m_cv(), m_map()
{
    // empty
}

void ThreadMap::Clear()
{
    std::lock_guard<std::mutex> lock(m_mutex);
    m_map.clear();
}

std::vector<std::thread::id> ThreadMap::ExtractStopped(std::size_t max_count)
{
    std::vector<std::thread::id> stopped;
    if (max_count == 0)
    {
        return stopped;
    }

    stopped.reserve(max_count);

    std::lock_guard<std::mutex> lock(m_mutex);
    for (std::unordered_map<std::thread::id, bool>::iterator it = m_map.begin();
         it != m_map.end() && stopped.size() < max_count;)
    {
        if (!it->second)
        {
            stopped.push_back(it->first);
            it = m_map.erase(it);
        }
        else
        {
            ++it;
        }
    }

    return stopped;
}

void ThreadMap::WaitForStopped()
{
    std::unique_lock<std::mutex> lock(m_mutex);
    m_cv.wait(lock, [this]() { return HasStoppedUnsafe(); });
}

bool ThreadMap::HasStoppedUnsafe() const
{
    for (std::unordered_map<std::thread::id, bool>::const_iterator it = m_map.begin();
         it != m_map.end(); ++it)
    {
        if (!it->second)
        {
            return true;
        }
    }

    return false;
}

} // namespace ilrd
