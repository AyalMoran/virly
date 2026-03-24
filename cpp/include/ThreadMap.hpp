#ifndef _ILRD_THREADMAP_HPP
#define _ILRD_THREADMAP_HPP

#include <cstddef>
#include <condition_variable>
#include <mutex>
#include <thread>
#include <unordered_map>
#include <vector>

namespace ilrd
{

class ThreadMap
{
  public:
    class ProxyValue
    {
      public:
        ProxyValue(ThreadMap& map, std::thread::id id);
        ProxyValue& operator=(bool is_running);
        operator bool() const;

      private:
        ThreadMap& m_map;
        std::thread::id m_id;
    };

    explicit ThreadMap();
    
    ProxyValue operator[](const std::thread::id& id);
    void Clear();
    std::vector<std::thread::id> ExtractStopped(std::size_t max_count);
    void WaitForStopped();

  private:
    bool HasStoppedUnsafe() const;

    mutable std::mutex m_mutex;
    std::condition_variable m_cv;
    std::unordered_map<std::thread::id, bool> m_map;
};

} // namespace ilrd

#endif /* _ILRD_THREADMAP_HPP */
