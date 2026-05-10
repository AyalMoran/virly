#include "storage/MinionStorageBackend.hpp"

#include <cerrno>
#include <cstring>
#include <stdexcept>
#include <system_error>

#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>

#include "DebugLogger.hpp"

namespace ilrd::concrete
{

namespace
{

void ReadFully(int fd, void* buffer, std::size_t length, std::uint64_t offset)
{
    char* out = static_cast<char*>(buffer);
    std::size_t total_read = 0;

    while (total_read < length)
    {
        const ssize_t bytes_read =
            pread(fd, out + total_read, length - total_read,
                  static_cast<off_t>(offset + total_read));
        if (bytes_read < 0)
        {
            throw std::system_error(errno, std::generic_category(),
                                    "MinionStorageBackend pread failed");
        }

        if (0 == bytes_read)
        {
            throw std::system_error(EIO, std::generic_category(),
                                    "MinionStorageBackend short pread");
        }

        total_read += static_cast<std::size_t>(bytes_read);
    }
}

void WriteFully(int fd, const void* buffer, std::size_t length, std::uint64_t offset)
{
    const char* in = static_cast<const char*>(buffer);
    std::size_t total_written = 0;

    while (total_written < length)
    {
        const ssize_t bytes_written =
            pwrite(fd, in + total_written, length - total_written,
                   static_cast<off_t>(offset + total_written));
        if (bytes_written < 0)
        {
            throw std::system_error(errno, std::generic_category(),
                                    "MinionStorageBackend pwrite failed");
        }

        if (0 == bytes_written)
        {
            throw std::system_error(EIO, std::generic_category(),
                                    "MinionStorageBackend short pwrite");
        }

        total_written += static_cast<std::size_t>(bytes_written);
    }
}

} // namespace

MinionStorageBackend::MinionStorageBackend(const std::string& path_name,
                                           std::uint64_t capacity_bytes)
    : m_fd(-1), m_pathName(path_name), m_capacityBytes(capacity_bytes)
{
    if (m_pathName.empty())
    {
        throw std::invalid_argument("MinionStorageBackend path must not be empty");
    }

    if (0 == m_capacityBytes)
    {
        throw std::invalid_argument(
            "MinionStorageBackend capacity must be nonzero");
    }

    struct stat before_open = {};
    const bool existed_before_open =
        (0 == stat(m_pathName.c_str(), &before_open));

    m_fd = open(m_pathName.c_str(), O_CREAT | O_RDWR, 0644);
    if (m_fd < 0)
    {
        throw std::system_error(errno, std::generic_category(),
                                "MinionStorageBackend open failed");
    }

    try
    {
        EnsureSizedForFirstUse(existed_before_open);
        ILRD_DEBUG_LOG("MinionStorageBackend opened path=" + m_pathName +
                       " capacity_bytes=" +
                       std::to_string(m_capacityBytes));
    }
    catch (...)
    {
        close(m_fd);
        m_fd = -1;
        throw;
    }
}

MinionStorageBackend::~MinionStorageBackend()
{
    if (m_fd >= 0)
    {
        close(m_fd);
    }
}

std::vector<std::uint8_t> MinionStorageBackend::Read(std::uint64_t offset,
                                                     std::uint32_t length) const
{
    ValidateRange(m_capacityBytes, offset, length);
    ILRD_DEBUG_LOG("MinionStorageBackend reading offset=" +
                   std::to_string(offset) + " length=" +
                   std::to_string(length));

    std::vector<std::uint8_t> payload(length, 0);
    if (0 == length)
    {
        return payload;
    }

    ReadFully(m_fd, payload.data(), payload.size(), offset);
    return payload;
}

void MinionStorageBackend::Write(std::uint64_t offset,
                                 const std::vector<std::uint8_t>& payload)
{
    if (payload.size() >
        static_cast<std::size_t>(static_cast<std::uint32_t>(-1)))
    {
        throw std::invalid_argument(
            "MinionStorageBackend payload exceeds wire length range");
    }

    ValidateRange(m_capacityBytes, offset,
                  static_cast<std::uint32_t>(payload.size()));
    ILRD_DEBUG_LOG("MinionStorageBackend writing offset=" +
                   std::to_string(offset) + " length=" +
                   std::to_string(payload.size()));
    if (payload.empty())
    {
        return;
    }

    WriteFully(m_fd, payload.data(), payload.size(), offset);
}

void MinionStorageBackend::Flush()
{
    ILRD_DEBUG_LOG("MinionStorageBackend flushing fd");
    if (0 != fsync(m_fd))
    {
        throw std::system_error(errno, std::generic_category(),
                                "MinionStorageBackend fsync failed");
    }
}

std::uint64_t MinionStorageBackend::GetCapacity() const
{
    return m_capacityBytes;
}

const std::string& MinionStorageBackend::GetPathName() const
{
    return m_pathName;
}

void MinionStorageBackend::ValidateRange(std::uint64_t capacity_bytes,
                                         std::uint64_t offset,
                                         std::uint32_t length)
{
    if (offset > capacity_bytes)
    {
        throw std::out_of_range("Storage offset exceeds capacity");
    }

    if (static_cast<std::uint64_t>(length) > capacity_bytes - offset)
    {
        throw std::out_of_range("Storage operation exceeds capacity");
    }
}

void MinionStorageBackend::EnsureSizedForFirstUse(bool existed_before_open)
{
    struct stat file_stat = {};
    if (0 != fstat(m_fd, &file_stat))
    {
        throw std::system_error(errno, std::generic_category(),
                                "MinionStorageBackend fstat failed");
    }

    const std::uint64_t current_size =
        static_cast<std::uint64_t>(file_stat.st_size);

    if (!existed_before_open)
    {
        if (0 != ftruncate(m_fd, static_cast<off_t>(m_capacityBytes)))
        {
            throw std::system_error(errno, std::generic_category(),
                                    "MinionStorageBackend ftruncate failed");
        }
        return;
    }

    if (current_size != m_capacityBytes)
    {
        throw std::invalid_argument(
            "Existing backing file size does not match configured capacity");
    }
}

} // namespace ilrd::concrete
