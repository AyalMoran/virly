/**************************************************************
 * File    : DirMonitorTest.cpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    : 2026-03-22
 **************************************************************/

#include <algorithm>    // std::find
#include <atomic>       // std::atomic
#include <chrono>       // std::chrono::milliseconds
#include <cstdlib>      // std::system
#include <filesystem>   // std::filesystem
#include <fstream>      // std::ofstream
#include <mutex>        // std::mutex
#include <stdexcept>    // std::runtime_error
#include <string>       // std::string
#include <thread>       // std::this_thread::sleep_for
#include <vector>       // std::vector

#include "DirMonitor.hpp"
#include "DllLoader.hpp"
#include "test_utils.hpp"

using namespace ilrd;
using namespace std::chrono;

namespace
{

std::filesystem::path BuildSharedObject(const std::string& stem)
{
    const std::filesystem::path root = std::filesystem::current_path();
    const std::filesystem::path build_dir = root / "build" / "dir_monitor_test";
    const std::filesystem::path source =
        root / "test" / "plugins" / "TestPlugin.cpp";
    const std::filesystem::path output = build_dir / (stem + ".so");

    std::filesystem::create_directories(build_dir);

    const std::string command = "g++ -shared -fPIC -std=c++20 \"" +
                                source.string() + "\" -o \"" +
                                output.string() + "\"";

    if (0 != std::system(command.c_str()))
    {
        throw std::runtime_error("failed to build test shared object");
    }

    return output;
}

bool WaitForCount(const std::atomic<int>& value, int target, milliseconds timeout)
{
    const steady_clock::time_point deadline = steady_clock::now() + timeout;

    while (steady_clock::now() < deadline)
    {
        if (value.load(std::memory_order_acquire) >= target)
        {
            return true;
        }

        std::this_thread::sleep_for(milliseconds(10));
    }

    return value.load(std::memory_order_acquire) >= target;
}

void Test_AddDeleteModifyAndDllLoad()
{
    INIT_SUITE(suite, "DirMonitor Integration");
    BEGIN_SUITE(suite);

    const std::filesystem::path temp_root =
        std::filesystem::temp_directory_path() / "ilrd_dir_monitor_test";
    const std::filesystem::path watch_dir = temp_root / "watched";
    const std::filesystem::path source_file = temp_root / "plain.txt";
    const std::filesystem::path moved_file = watch_dir / "plain.txt";
    const std::filesystem::path built_plugin = BuildSharedObject("DirMonitorPlugin");
    const std::filesystem::path staged_plugin = temp_root / "staged_plugin.so";
    const std::filesystem::path copied_plugin = watch_dir / "loaded_plugin.so";

    std::filesystem::remove_all(temp_root);
    std::filesystem::create_directories(watch_dir);

    std::atomic<int> added_count(0);
    std::atomic<int> deleted_count(0);
    std::atomic<int> modified_count(0);
    std::vector<std::string> added_paths;
    std::vector<std::string> deleted_paths;
    std::vector<std::string> modified_paths;
    std::mutex paths_mutex;

    DllLoader loader;
    DirMonitor monitor(watch_dir.string());

    monitor.SubscribeAdded([&](const std::string& path) {
        std::lock_guard<std::mutex> lock(paths_mutex);
        added_paths.push_back(path);
        added_count.fetch_add(1, std::memory_order_release);
    });

    monitor.SubscribeDeleted([&](const std::string& path) {
        std::lock_guard<std::mutex> lock(paths_mutex);
        deleted_paths.push_back(path);
        deleted_count.fetch_add(1, std::memory_order_release);
    });

    monitor.SubscribeModified([&](const std::string& path) {
        std::lock_guard<std::mutex> lock(paths_mutex);
        modified_paths.push_back(path);
        modified_count.fetch_add(1, std::memory_order_release);
    });

    monitor.SubscribeAdded([&loader](const std::string& path) {
        if (std::filesystem::path(path).extension() == ".so")
        {
            loader.LoadSharedObject(path);
        }
    });

    {
        std::ofstream out(source_file.string().c_str());
        out << "hello";
    }
    std::filesystem::rename(source_file, moved_file);

    RUN_TEST(suite, "file add event observed",
             WaitForCount(added_count, 1, milliseconds(1500)));

    {
        std::ofstream out(moved_file.string().c_str(), std::ios::app);
        out << " world";
    }

    RUN_TEST(suite, "file modify event observed",
             WaitForCount(modified_count, 1, milliseconds(1500)));

    std::filesystem::remove(moved_file);
    RUN_TEST(suite, "file delete event observed",
             WaitForCount(deleted_count, 1, milliseconds(1500)));

    std::filesystem::copy_file(built_plugin, staged_plugin,
                               std::filesystem::copy_options::overwrite_existing);
    std::filesystem::rename(staged_plugin, copied_plugin);

    RUN_TEST(suite, "shared object add event observed",
             WaitForCount(added_count, 2, milliseconds(3000)));
    RUN_TEST(suite, "shared object was loaded by callback",
             loader.IsLoaded(copied_plugin.string()));

    {
        std::lock_guard<std::mutex> lock(paths_mutex);
        RUN_TEST(suite, "added paths include watched file",
                 std::find(added_paths.begin(), added_paths.end(),
                           moved_file.string()) != added_paths.end());
        RUN_TEST(suite, "deleted paths include watched file",
                 std::find(deleted_paths.begin(), deleted_paths.end(),
                           moved_file.string()) != deleted_paths.end());
        RUN_TEST(suite, "modified paths include watched file",
                 std::find(modified_paths.begin(), modified_paths.end(),
                           moved_file.string()) != modified_paths.end());
        RUN_TEST(suite, "added paths include copied plugin",
                 std::find(added_paths.begin(), added_paths.end(),
                           copied_plugin.string()) != added_paths.end());
    }

    std::filesystem::remove_all(temp_root);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void RegisterTests()
{
    REGISTER_TEST(Test_AddDeleteModifyAndDllLoad);
}

} // namespace

int main()
{
    PRINT_TEST_HEADER("DirMonitor");
    RegisterTests();

    for (int i = 0; i < TestUtils::GetRegisteredTestCount(); ++i)
    {
        TestUtils::RunRegisteredTest(i);
    }

    PRINT_SUMMARY();
    return (TestUtils::GetPassedTests() == TestUtils::GetTotalTests()) ? 0 : 1;
}
