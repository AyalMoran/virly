/**
 * @file UUID.hpp
 * @brief Declares the project UUID value object used on the wire.
 */
#ifndef ILRD_CONCRETE_UUID_HPP
#define ILRD_CONCRETE_UUID_HPP

#include <atomic>
#include <cstdint>
#include <ctime>
#include <ifaddrs.h>
#include <memory>
#include <netinet/in.h>
#include <sstream>
#include <stdexcept>
#include <string>
#include <sys/types.h>
#include <unistd.h>

#include "serialization/Serializer.hpp"
#include "wire/WireTypes.hpp"

namespace ilrd
{

/**
 * @brief Serializable identifier composed from time, process, IP, and counter.
 *
 * The default constructor generates a best-effort unique identifier for the
 * current process. The explicit constructor is intended for tests and
 * deserialization.
 */
class UUID
{
  public:
    /**
     * @brief Serialized byte size of a UUID value.
     */
    static constexpr std::size_t SERIALIZED_SIZE = 24;

    /**
     * @brief Generates a new UUID for the current process and host.
     */
    UUID()
        : m_counter(NextCounter()),
          m_time(ReadCurrentTime()),
          m_pid(static_cast<std::uint32_t>(getpid())),
          m_ip(ResolveIPAddress())
    {
    }

    /**
     * @brief Constructs a UUID from explicit field values.
     * @param counter Monotonic counter component.
     * @param unix_seconds Unix timestamp component.
     * @param process_id Process identifier component.
     * @param ipv4 Host IPv4 address component in host byte order.
     */
    UUID(std::uint64_t counter,
         std::int64_t unix_seconds,
         std::uint32_t process_id,
         std::uint32_t ipv4)
        : m_counter(counter),
          m_time(unix_seconds),
          m_pid(process_id),
          m_ip(ipv4)
    {
    }

    /**
     * @brief Serializes the UUID into a buffer.
     * @param buffer Destination buffer.
     * @return `buffer`.
     */
    Buffer& Serialize(Buffer& buffer) const
    {
        buffer << wire::u64(m_counter);
        buffer << wire::i64(m_time);
        buffer << wire::u32(m_pid);
        buffer << wire::u32(m_ip);
        return buffer;
    }

    /**
     * @brief Deserializes the UUID from a buffer.
     * @param buffer Source buffer.
     * @return `buffer`.
     */
    Buffer& Deserialize(Buffer& buffer)
    {
        wire::U64 counter;
        wire::I64 time;
        wire::U32 pid;
        wire::U32 ip;

        buffer >> counter;
        buffer >> time;
        buffer >> pid;
        buffer >> ip;

        m_counter = counter.value;
        m_time = time.value;
        m_pid = pid.value;
        m_ip = ip.value;
        return buffer;
    }

    /**
     * @brief Returns the counter component of the UUID.
     * @return Monotonic counter value.
     */
    std::uint64_t CounterValue() const
    {
        return m_counter;
    }

    /**
     * @brief Returns a readable string representation.
     * @return Human-readable UUID summary.
     */
    std::string ToString() const
    {
        std::ostringstream oss;
        oss << "UUID{counter=" << m_counter
            << ", time=" << static_cast<long long>(m_time)
            << ", pid=" << static_cast<unsigned long>(m_pid)
            << ", ip=" << ((m_ip >> 24) & 0xFFu) << '.'
            << ((m_ip >> 16) & 0xFFu) << '.'
            << ((m_ip >> 8) & 0xFFu) << '.'
            << (m_ip & 0xFFu) << '}';

        return oss.str();
    }

    friend bool operator==(const UUID& lhs, const UUID& rhs) = default;

    /**
     * @brief Provides strict ordering for associative containers.
     * @param lhs Left operand.
     * @param rhs Right operand.
     * @return `true` when `lhs` is ordered before `rhs`.
     */
    friend bool operator<(const UUID& lhs, const UUID& rhs)
    {
        if (lhs.m_counter != rhs.m_counter)
        {
            return lhs.m_counter < rhs.m_counter;
        }

        if (lhs.m_time != rhs.m_time)
        {
            return lhs.m_time < rhs.m_time;
        }

        if (lhs.m_pid != rhs.m_pid)
        {
            return lhs.m_pid < rhs.m_pid;
        }

        return lhs.m_ip < rhs.m_ip;
    }

  private:
    static constexpr std::uint8_t LOCAL_PREFIX = 127;

    struct IfAddrsDeleter
    {
        void operator()(struct ifaddrs* ptr) const noexcept
        {
            if (nullptr != ptr)
            {
                freeifaddrs(ptr);
            }
        }
    };

    using IfAddrsHandle = std::unique_ptr<struct ifaddrs, IfAddrsDeleter>;

    static std::uint64_t NextCounter()
    {
        return Counter().fetch_add(1, std::memory_order_relaxed) + 1;
    }

    static std::atomic_uint64_t& Counter()
    {
        static std::atomic_uint64_t counter(0);
        return counter;
    }

    static std::int64_t ReadCurrentTime()
    {
        const std::time_t now = std::time(nullptr);
        if (static_cast<std::time_t>(-1) == now)
        {
            throw std::runtime_error("UUID failed to read current time");
        }

        return static_cast<std::int64_t>(now);
    }

    static IfAddrsHandle LoadInterfaces()
    {
        struct ifaddrs* list = nullptr;

        if (-1 == getifaddrs(&list))
        {
            throw std::runtime_error("UUID failed to enumerate network interfaces");
        }

        return IfAddrsHandle(list);
    }

    static std::uint32_t ResolveIPAddress()
    {
        const IfAddrsHandle interfaces = LoadInterfaces();
        std::uint32_t loopback_address = 0;

        for (const struct ifaddrs* it = interfaces.get(); nullptr != it;
             it = it->ifa_next)
        {
            if (nullptr == it->ifa_addr || AF_INET != it->ifa_addr->sa_family)
            {
                continue;
            }

            const struct sockaddr_in* sa =
                reinterpret_cast<const struct sockaddr_in*>(it->ifa_addr);
            const std::uint32_t host_order = ntohl(sa->sin_addr.s_addr);

            if (LOCAL_PREFIX == (host_order >> 24))
            {
                if (0 == loopback_address)
                {
                    loopback_address = host_order;
                }
                continue;
            }

            return host_order;
        }

        return loopback_address;
    }

    std::uint64_t m_counter;
    std::int64_t m_time;
    std::uint32_t m_pid;
    std::uint32_t m_ip;
};

} // namespace ilrd

#endif // ILRD_CONCRETE_UUID_HPP
