/**************************************************************
 * File    : Framework.hpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    : 2026-03-24
 **************************************************************/
#ifndef ILRD_FRAMEWORK_HPP
#define ILRD_FRAMEWORK_HPP

#include <chrono>      // std::chrono::milliseconds
#include <functional>  // std::function
#include <map>         // std::map
#include <memory>      // std::shared_ptr, std::unique_ptr
#include <string>      // std::string

#include "Handleton.hpp"   // Handleton
#include "Reactor.hpp"     // Reactor
#include "SharedPtr.hpp"   // SharedPtr
#include "ThreadPool.hpp"  // ThreadPool

namespace ilrd
{

class Framework;
class DirMonitor;
class DllLoader;

class IKeyTask
{
  public:
    virtual ~IKeyTask() = default;
    virtual int GetKey() const = 0;
};

using IKeyArgs = IKeyTask;

class ITask : public IKeyTask
{
  public:
    ~ITask() override = default;
};

class IInputProxy
{
  public:
    virtual ~IInputProxy() = default;
    virtual ITask* GetTask(int fd) = 0;
};

class ICommand
{
  public:
    struct PostTaskParams
    {
        std::function<bool()> action;
        std::chrono::milliseconds time_interval;
    };

    virtual ~ICommand() = default;
    virtual std::unique_ptr<PostTaskParams>
    Execute(SharedPtr<ITask> task) = 0;
};

using CommandCreator = ICommand* (*)();

void RegisterCommandCreator(int key, CommandCreator creator);
std::unique_ptr<ICommand> CreateCommand(int key);
void RequestFrameworkStop();

class InputMediator
{
  public:
    using ProxyMap = std::map<IListener::ModeAndFd, std::shared_ptr<IInputProxy>>;

    explicit InputMediator(const ProxyMap& proxies);

    void RegisterAll(Reactor& reactor);

  private:
    void OnInputReady(int fd, IListener::Mode mode);

    ProxyMap m_proxies;
};

class FrameworkTask : public ThreadPool::ITPTask
{
  public:
    explicit FrameworkTask(SharedPtr<ITask> task);

    void Execute() override;

  private:
    SharedPtr<ITask> m_task;
};

class Framework
{
  public:
    using ProxyMap = InputMediator::ProxyMap;
    using CommandMap = std::map<int, CommandCreator>;

    Framework(const ProxyMap& input_proxy_map,
              const CommandMap& command_creators,
              const std::string& plugins_folder_path_name);
    ~Framework();

    void Run();
    void Stop();

  private:
    void LoadExistingPlugins();
    void TryLoadPlugin(const std::string& path_name);
    static bool IsSharedObjectPath(const std::string& path_name);

    LinuxFdListener m_listener;
    Reactor m_reactor;
    InputMediator m_inputMediator;
    std::string m_pluginsFolderPathName;
    DllLoader* m_pluginLoader;
    DirMonitor* m_pluginMonitor;
    int m_stopPipe[2];
    bool m_stopRequested;
};

} // namespace ilrd

#endif /* ILRD_FRAMEWORK_HPP */
