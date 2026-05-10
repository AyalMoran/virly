/**
 * @file NBDCommunicator.hpp
 * @brief Declares the Linux NBD request/reply transport wrapper.
 */
#ifndef ILRD_CONCRETE_NBD_COMMUNICATOR_HPP
#define ILRD_CONCRETE_NBD_COMMUNICATOR_HPP

#include <array>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

#include <sys/types.h>

namespace ilrd::concrete
{

/**
 * @brief Wraps the Linux Network Block Device userspace protocol.
 */
class NBDCommunicator
{
  public:
    /**
     * @brief NBD request types understood by the communicator.
     */
    enum class RequestType
    {
        READ,
        WRITE,
        FLUSH,
        DISCONNECT,
        UNSUPPORTED
    };

    /**
     * @brief Options used to configure a kernel NBD device connection.
     */
    struct Options
    {
        std::string device_path;
        std::uint64_t size_bytes = 0;
        std::uint32_t block_size = 4096;
        bool enable_flush = true;
    };

    /**
     * @brief Decoded NBD request delivered from the kernel.
     */
    struct Request
    {
        RequestType type = RequestType::UNSUPPORTED;
        std::uint64_t offset = 0;
        std::uint32_t length = 0;
        std::uint32_t raw_type = 0;
        std::array<char, 8> handle = {};
        std::vector<std::uint8_t> payload;
    };

    explicit NBDCommunicator(int io_fd, bool owns_fd = false);
    ~NBDCommunicator();
    NBDCommunicator(const NBDCommunicator&) = delete;
    NBDCommunicator& operator=(const NBDCommunicator&) = delete;

    /**
     * @brief Creates and configures a communicator bound to an NBD device.
     * @param options Device path and size configuration.
     * @return Owning communicator instance.
     */
    static std::unique_ptr<NBDCommunicator> Connect(const Options& options);

    int GetFd() const;
    bool ReceiveRequest(Request& out);
    void SendReply(const Request& request,
                   int error_code,
                   const std::vector<std::uint8_t>& payload =
                       std::vector<std::uint8_t>());
    void Disconnect();

    static std::uint64_t HostToNetwork64(std::uint64_t value);
    static std::uint64_t NetworkToHost64(std::uint64_t value);

  private:
    NBDCommunicator(int io_fd, int nbd_fd, pid_t child_pid, bool owns_io_fd);

    static void ReadAll(int fd, void* buffer, std::size_t count);
    static void WriteAll(int fd, const void* buffer, std::size_t count);
    static RequestType ToRequestType(std::uint32_t raw_type);
    static void ConfigureNBDDevice(int nbd_fd,
                                   int kernel_socket,
                                   const Options& options);
    static void RunKernelSide(int nbd_fd,
                              int kernel_socket,
                              const Options& options);

    int m_ioFd;
    int m_nbdFd;
    pid_t m_childPid;
    bool m_ownsIoFd;
};

} // namespace ilrd::concrete

#endif // ILRD_CONCRETE_NBD_COMMUNICATOR_HPP
