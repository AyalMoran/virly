/**
 * @file MinionStorageBackend.hpp
 * @brief Declares the file-backed storage implementation used by a minion.
 */
#ifndef ILRD_CONCRETE_MINION_STORAGE_BACKEND_HPP
#define ILRD_CONCRETE_MINION_STORAGE_BACKEND_HPP

#include <cstdint>
#include <string>
#include <vector>

namespace ilrd::concrete
{

/**
 * @brief Serves block I/O requests against a local file.
 */
class MinionStorageBackend
{
  public:
    /**
     * @brief Opens or creates the backing file for a minion.
     * @param path_name Path to the backing file.
     * @param capacity_bytes Logical capacity exposed by the minion.
     */
    MinionStorageBackend(const std::string& path_name, std::uint64_t capacity_bytes);

    /**
     * @brief Closes the backing file descriptor.
     */
    ~MinionStorageBackend();

    MinionStorageBackend(const MinionStorageBackend&) = delete;
    MinionStorageBackend& operator=(const MinionStorageBackend&) = delete;

    std::vector<std::uint8_t> Read(std::uint64_t offset, std::uint32_t length) const;
    void Write(std::uint64_t offset, const std::vector<std::uint8_t>& payload);
    void Flush();
    std::uint64_t GetCapacity() const;
    const std::string& GetPathName() const;

  private:
    static void ValidateRange(std::uint64_t capacity_bytes,
                              std::uint64_t offset,
                              std::uint32_t length);
    void EnsureSizedForFirstUse(bool existed_before_open);

    int m_fd;
    std::string m_pathName;
    std::uint64_t m_capacityBytes;
};

} // namespace ilrd::concrete

#endif // ILRD_CONCRETE_MINION_STORAGE_BACKEND_HPP
