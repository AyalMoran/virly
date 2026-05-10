/**************************************************************
 * File    : Reactor.hpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    : 12-03-2026
 **************************************************************/
/**
 * @file Reactor.hpp
 * @brief Declares the file-descriptor reactor and listener abstraction.
 */
#ifndef ILRD_REACTOR_HPP
#define ILRD_REACTOR_HPP

#include <cstddef>       // std::size_t
#include <functional>    // std::function
#include <unordered_map> // std::unordered_map
#include <utility>       // std::pair
#include <vector>        // std::vector

namespace ilrd
{

/**
 * @brief Interface for waiting on file descriptors.
 */
class IListener
{
  public:
    /**
     * @brief Supported readiness modes.
     */
    enum Mode
    {
        READ = 0,
        WRITE = 1,
        NUM_OF_MODES
    };

    /**
     * @brief A monitored `(mode, fd)` pair.
     */
    typedef std::pair<Mode, int> ModeAndFd;

    virtual ~IListener() = default;

    /**
     * @brief Waits until one or more descriptors are ready.
     * @param descriptors Descriptors to watch.
     * @return The ready descriptors.
     */
    virtual const std::vector<ModeAndFd>& Listen(
        const std::vector<ModeAndFd>& descriptors) = 0;
};

/**
 * @brief Single-threaded reactor for fd callbacks.
 *
 * Each callback is stored by `(mode, fd)`. Adding the same key again replaces
 * the old callback. If more than one descriptor is ready at the same time,
 * callback order is not defined.
 */
class Reactor
{
  public:
    /**
     * @brief Callback type called for a ready descriptor.
     */
    typedef std::function<void(int fd, IListener::Mode mode)> ActionFunc;

    /**
     * @brief Creates a reactor that uses the given listener.
     * @param listener Object that waits for ready descriptors.
     */
    explicit Reactor(IListener& listener);

    /**
     * @brief Adds or replaces a callback for `(fd, mode)`.
     * @param fd File descriptor to watch.
     * @param mode Readiness mode to watch.
     * @param proc Callback to call when ready.
     */
    void AddFd(int fd, IListener::Mode mode, const ActionFunc& proc);

    /**
     * @brief Removes the callback for `(fd, mode)`.
     * @param fd File descriptor to stop watching.
     * @param mode Readiness mode to stop watching.
     */
    void RemoveFd(int fd, IListener::Mode mode);

    /**
     * @brief Runs the event loop.
     *
     * This call blocks until Stop() is called or until no callbacks are left.
     * Calling Run() while it is already running throws.
     */
    void Run();

    /**
     * @brief Stops the current Run() loop.
     *
     * This is meant to be called from a callback or coordinating thread.
     */
    void Stop();

    /**
     * @brief Checks whether Run() is active.
     * @return `true` if the reactor is running.
     */
    bool IsRunning() const;

    /**
     * @brief Returns how many callbacks are registered.
     * @return Number of stored `(mode, fd)` callbacks.
     */
    std::size_t Size() const;

  private:
    struct ModeAndFdHash
    {
        std::size_t operator()(const IListener::ModeAndFd& key) const;
    };

    typedef std::unordered_map<IListener::ModeAndFd, ActionFunc, ModeAndFdHash>
        ActionMap;

    static std::vector<IListener::ModeAndFd>
    BuildDescriptorList(const ActionMap& actions);

    IListener& m_listener;
    ActionMap m_actions;
    bool m_isRunning;
    bool m_stopRequested;
};

/**
 * @brief Linux listener that uses `select()`.
 */
class LinuxFdListener : public IListener
{
  public:
    /**
     * @brief Creates a listener backed by `select()`.
     */
    LinuxFdListener();

    /**
     * @brief Waits for ready descriptors with `select()`.
     * @param descriptors Descriptors to watch.
     * @return The ready descriptors.
     */
    const std::vector<ModeAndFd>& Listen(
        const std::vector<ModeAndFd>& descriptors) override;

  private:
    std::vector<ModeAndFd> m_readyDescriptors;
};

} // namespace ilrd

#endif /* ILRD_REACTOR_HPP */
