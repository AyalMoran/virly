/**************************************************************
 * File    : FrameworkDemo.cpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    : 2026-03-24
 **************************************************************/

#include <chrono>      // std::chrono::milliseconds
#include <filesystem>  // std::filesystem
#include <iostream>    // std::cout
#include <map>         // std::map
#include <memory>      // std::shared_ptr
#include <stdexcept>   // std::runtime_error
#include <string>      // std::string
#include <thread>      // std::thread
#include <unistd.h>    // pipe

#include "Framework.hpp"
#include "FrameworkDemoCommon.hpp"
#include "NBDProxy.hpp"

namespace
{

class PrintCommand : public ilrd::ICommand
{
  public:
    std::unique_ptr<WaitForResponseParams>
    Execute(ilrd::SharedPtr<ilrd::ITask> task) override
    {
        ilrd::demo::DemoTask& demo_task =
            dynamic_cast<ilrd::demo::DemoTask&>(*task);
        std::cout << "PrintCommand: " << demo_task.GetPayload() << std::endl;
        return std::unique_ptr<WaitForResponseParams>();
    }
};

class QuitCommand : public ilrd::ICommand
{
  public:
    std::unique_ptr<WaitForResponseParams>
    Execute(ilrd::SharedPtr<ilrd::ITask> task) override
    {
        (void)task;
        std::cout << "QuitCommand: Bye" << std::endl;
        ilrd::RequestFrameworkStop();
        return std::unique_ptr<WaitForResponseParams>();
    }
};

ilrd::ICommand* CreatePrintCommand()
{
    return new PrintCommand();
}

ilrd::ICommand* CreateQuitCommand()
{
    return new QuitCommand();
}

void WriteLine(int fd, const std::string& line)
{
    const std::string with_newline = line + "\n";
    const ssize_t bytes_written =
        write(fd, with_newline.data(), with_newline.size());
    if (bytes_written != static_cast<ssize_t>(with_newline.size()))
    {
        throw std::runtime_error("write failed");
    }
}

} // namespace

int main(int argc, char** argv)
{
    if (argc != 2)
    {
        std::cerr << "usage: " << argv[0] << " <plugin-so-path>" << std::endl;
        return 1;
    }

    const std::filesystem::path plugin_source = argv[1];
    const std::filesystem::path temp_root =
        std::filesystem::temp_directory_path() / "ilrd_framework_demo";
    const std::filesystem::path plugins_dir = temp_root / "plugins";
    const std::filesystem::path runtime_plugin = plugins_dir / "PrintV2.so";

    std::filesystem::remove_all(temp_root);
    std::cout << runtime_plugin << std::endl;
    std::filesystem::create_directories(plugins_dir);
    
    //only here to see the creation of the plugins directory
    // sleep(20);

    int pipe_fds[2] = {-1, -1};
    if (0 != pipe(pipe_fds))
    {
        throw std::runtime_error("pipe failed");
    }

    try
    {
        std::shared_ptr<ilrd::IInputProxy> nbd_proxy(new ilrd::NBDProxy());
        ilrd::Framework::ProxyMap input_proxy_map;
        input_proxy_map[ilrd::IListener::ModeAndFd(ilrd::IListener::READ,
                                                   pipe_fds[0])] = nbd_proxy;

        ilrd::Framework::CommandMap command_creators;
        command_creators[ilrd::demo::PRINT_TASK] = &CreatePrintCommand;
        command_creators[ilrd::demo::QUIT_TASK] = &CreateQuitCommand;

        ilrd::Framework framework(input_proxy_map, command_creators,
                                  plugins_dir.string());

        std::thread runner([&framework]() { framework.Run(); });

        std::this_thread::sleep_for(std::chrono::milliseconds(150));
        WriteLine(pipe_fds[1], "print:before-plugin");

        std::this_thread::sleep_for(std::chrono::milliseconds(250));
        std::filesystem::copy_file(plugin_source, runtime_plugin,
                                   std::filesystem::copy_options::overwrite_existing);

        std::this_thread::sleep_for(std::chrono::milliseconds(500));
        WriteLine(pipe_fds[1], "print:after-plugin");

        std::this_thread::sleep_for(std::chrono::milliseconds(200));
        WriteLine(pipe_fds[1], "quit");

        runner.join();
    }
    catch (...)
    {
        close(pipe_fds[0]);
        close(pipe_fds[1]);
        std::filesystem::remove_all(temp_root);
        throw;
    }

    close(pipe_fds[0]);
    close(pipe_fds[1]);
    std::filesystem::remove_all(temp_root);

    return 0;
}
