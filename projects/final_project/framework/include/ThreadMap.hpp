/**
 * @file ThreadMap.hpp
 * @brief Declares a thread-state tracker used by the thread pool.
 */
#ifndef _ILRD_THREADMAP_HPP
#define _ILRD_THREADMAP_HPP

#include <condition_variable>
#include <cstddef>
#include <mutex>
#include <thread>
#include <unordered_map>
#include <vector>

namespace ilrd
{

/**
 * @brief Tracks whether worker threads are currently running or stopped.
 */
class ThreadMap
{
  public:
    /**
     * @brief Proxy object used to assign and read per-thread state entries.
     */
    class ProxyValue
    {
      public:
        /**
         * @brief Creates a proxy bound to one thread id in the parent map.
         * @param map Parent map to update.
         * @param id Thread identifier represented by this proxy.
         */
        ProxyValue(ThreadMap& map, std::thread::id id);

        /**
         * @brief Stores the running state for the bound thread id.
         * @param is_running `true` when the thread is currently active.
         * @return `*this`.
         */
        ProxyValue& operator=(bool is_running);

        /**
         * @brief Reads the running state for the bound thread id.
         * @return Current stored state.
         */
        operator bool() const;

      private:
        ThreadMap& m_map;
        std::thread::id m_id;
    };

    /**
     * @brief Creates an empty thread-state map.
     */
    explicit ThreadMap();

    /**
     * @brief Returns a proxy for reading or writing one thread entry.
     * @param id Thread identifier to access.
     * @return Proxy bound to `id`.
     */
    ProxyValue operator[](const std::thread::id& id);

    /**
     * @brief Removes all tracked thread state.
     */
    void Clear();

    /**
     * @brief Removes and returns up to `max_count` stopped thread ids.
     * @param max_count Maximum number of stopped ids to extract.
     * @return Vector of removed stopped thread ids.
     */
    std::vector<std::thread::id> ExtractStopped(std::size_t max_count);

    /**
     * @brief Blocks until at least one tracked thread is marked stopped.
     */
    void WaitForStopped();

  private:
    bool HasStoppedUnsafe() const;

    mutable std::mutex m_mutex;
    std::condition_variable m_cv;
    std::unordered_map<std::thread::id, bool> m_map;
};

} // namespace ilrd

#endif /* _ILRD_THREADMAP_HPP */
