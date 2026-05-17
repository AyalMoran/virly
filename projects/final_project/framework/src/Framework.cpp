/**************************************************************
 * File    : Framework.cpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    : 2026-03-24
 **************************************************************/

#include <filesystem>   // std::filesystem
#include <mutex>        // std::mutex
#include <stdexcept>    // std::runtime_error
#include <system_error> // std::system_error
#include <unistd.h>     // pipe

#include "AsyncInjection.hpp" // AsyncInjection
#include "DllLoader.hpp"      // DllLoader
#include "DirMonitor.hpp"     // DirMonitor
#include "Factory.hpp"        // Factory
#include "Framework.hpp"

namespace ilrd
{

namespace
{

using CommandFactory = Factory<ICommand, int>;

struct CommandFactoryState
{
    CommandFactory m_factory;
    std::mutex m_mutex;
};

struct FrameworkRuntimeState
{
    Framework* m_activeFramework = nullptr;
    std::mutex m_mutex;
};

std::size_t ReadAvailable(int fd, char* buffer, std::size_t buffer_size)
{
    const ssize_t bytes_read = read(fd, buffer, buffer_size);
    if (bytes_read < 0)
    {
        throw std::system_error(errno, std::generic_category(), "read failed");
    }

    return static_cast<std::size_t>(bytes_read);
}

} // namespace

void RegisterCommandCreator(int key, CommandCreator creator)
{
    if (nullptr == creator)
    {
        throw std::invalid_argument("RegisterCommandCreator() null creator");
    }

    CommandFactoryState* const factory_state =
        Handleton<CommandFactoryState>::GetInstance();
    std::lock_guard<std::mutex> lock(factory_state->m_mutex);
    factory_state->m_factory.Add(
        key, [creator]() { return std::unique_ptr<ICommand>(creator()); });
}

std::unique_ptr<ICommand> CreateCommand(int key)
{
    CommandFactoryState* const factory_state =
        Handleton<CommandFactoryState>::GetInstance();
    std::lock_guard<std::mutex> lock(factory_state->m_mutex);
    return factory_state->m_factory.Create(key);
}

void RequestFrameworkStop()
{
    FrameworkRuntimeState* const runtime_state =
        Handleton<FrameworkRuntimeState>::GetInstance();
    std::lock_guard<std::mutex> lock(runtime_state->m_mutex);
    Framework* framework = runtime_state->m_activeFramework;
    if (nullptr != framework)
    {
        framework->Stop();
    }
}

InputMediator::InputMediator(const ProxyMap& proxies) : m_proxies(proxies)
{
}

void InputMediator::RegisterAll(Reactor& reactor)
{
    for (ProxyMap::const_iterator iter = m_proxies.begin(); iter != m_proxies.end();
         ++iter)
    {
        reactor.AddFd(iter->first.second, iter->first.first,
                      [this](int fd, IListener::Mode mode)
                      { OnInputReady(fd, mode); });
    }
}

void InputMediator::OnInputReady(int fd, IListener::Mode mode)
{
    ProxyMap::const_iterator iter = m_proxies.find(IListener::ModeAndFd(mode, fd));
    if (m_proxies.end() == iter || !iter->second)
    {
        return;
    }

    SharedPtr<ITask> task(iter->second->GetTask(fd));
    if (!task)
    {
        return;
    }

    Handleton<ThreadPool>::GetInstance()->AddTask(
        SharedPtr<ThreadPool::ITPTask>(new FrameworkTask(task)),
        UserPriority::MED);
}

FrameworkTask::FrameworkTask(SharedPtr<ITask> task) : m_task(task)
{
}

void FrameworkTask::Execute()
{
    std::unique_ptr<ICommand> command(CreateCommand(m_task->GetKey()));
    std::unique_ptr<ICommand::PostTaskParams> async_params =
        command->Execute(m_task);

    if (async_params)
    {
        new AsyncInjection(async_params->action, async_params->time_interval);
    }
}

Framework::Framework(const ProxyMap& input_proxy_map,
                     const CommandMap& command_creators,
                     const std::string& plugins_folder_path_name)
    : m_listener(),
      m_reactor(m_listener),
      m_inputMediator(input_proxy_map),
      m_pluginsFolderPathName(plugins_folder_path_name),
      m_pluginLoader(new DllLoader()),
      m_pluginMonitor(nullptr),
      m_stopPipe{-1, -1},
      m_stopRequested(false)
{
    for (CommandMap::const_iterator iter = command_creators.begin();
         iter != command_creators.end(); ++iter)
    {
        RegisterCommandCreator(iter->first, iter->second);
    }

    if (0 != pipe(m_stopPipe))
    {
        throw std::system_error(errno, std::generic_category(), "pipe failed");
    }

    m_reactor.AddFd(m_stopPipe[0], IListener::READ,
                    [this](int fd, IListener::Mode mode)
                    {
                        (void)mode;
                        char buffer[32] = {};
                        const std::size_t bytes_read =
                            ReadAvailable(fd, buffer, sizeof(buffer));
                        (void)bytes_read;
                        if (m_stopRequested)
                        {
                            m_reactor.RemoveFd(fd, IListener::READ);
                            m_reactor.Stop();
                        }
                    });

    m_inputMediator.RegisterAll(m_reactor);

    if (!m_pluginsFolderPathName.empty())
    {
        std::filesystem::create_directories(m_pluginsFolderPathName);
        m_pluginMonitor = new DirMonitor(m_pluginsFolderPathName);
        m_pluginMonitor->SubscribeAdded(
            [this](const std::string& path_name) { TryLoadPlugin(path_name); });
    }
}

Framework::~Framework()
{
    Stop();

    if (nullptr != m_pluginMonitor)
    {
        delete m_pluginMonitor;
        m_pluginMonitor = nullptr;
    }

    if (nullptr != m_pluginLoader)
    {
        delete m_pluginLoader;
        m_pluginLoader = nullptr;
    }

    if (-1 != m_stopPipe[0])
    {
        close(m_stopPipe[0]);
    }

    if (-1 != m_stopPipe[1])
    {
        close(m_stopPipe[1]);
    }

    Handleton<ThreadPool>::GetInstance()->Stop();
}

void Framework::Run()
{
    LoadExistingPlugins();

    {
        FrameworkRuntimeState* const runtime_state =
            Handleton<FrameworkRuntimeState>::GetInstance();
        std::lock_guard<std::mutex> lock(runtime_state->m_mutex);
        runtime_state->m_activeFramework = this;
    }

    try
    {
        m_reactor.Run();
    }
    catch (...)
    {
        FrameworkRuntimeState* const runtime_state =
            Handleton<FrameworkRuntimeState>::GetInstance();
        std::lock_guard<std::mutex> lock(runtime_state->m_mutex);
        if (runtime_state->m_activeFramework == this)
        {
            runtime_state->m_activeFramework = nullptr;
        }
        throw;
    }

    FrameworkRuntimeState* const runtime_state =
        Handleton<FrameworkRuntimeState>::GetInstance();
    std::lock_guard<std::mutex> lock(runtime_state->m_mutex);
    if (runtime_state->m_activeFramework == this)
    {
        runtime_state->m_activeFramework = nullptr;
    }
}

void Framework::Stop()
{
    m_stopRequested = true;
    if (-1 != m_stopPipe[1])
    {
        const char stop_byte = 'x';
        const ssize_t bytes_written = write(m_stopPipe[1], &stop_byte, 1);
        (void)bytes_written;
    }
}

void Framework::LoadExistingPlugins()
{
    if (m_pluginsFolderPathName.empty())
    {
        return;
    }

    const std::filesystem::path folder(m_pluginsFolderPathName);
    if (!std::filesystem::exists(folder))
    {
        return;
    }

    for (std::filesystem::directory_iterator iter(folder), end; iter != end; ++iter)
    {
        if (!iter->is_regular_file())
        {
            continue;
        }

        TryLoadPlugin(iter->path().string());
    }
}

void Framework::TryLoadPlugin(const std::string& path_name)
{
    if (!IsSharedObjectPath(path_name))
    {
        return;
    }

    m_pluginLoader->LoadSharedObject(path_name);
}

bool Framework::IsSharedObjectPath(const std::string& path_name)
{
    return ".so" == std::filesystem::path(path_name).extension().string();
}

} // namespace ilrd
