/**************************************************************
 * File    : DllLoaderTest.cpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    : 2026-03-22
 **************************************************************/

#include <cstdlib>      // std::system
#include <filesystem>   // std::filesystem
#include <stdexcept>    // std::runtime_error
#include <string>       // std::string

#include "DllLoader.hpp"
#include "test_utils.hpp"

using namespace ilrd;

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

void Test_LoadSharedObject()
{
    INIT_SUITE(suite, "Load Shared Object");
    BEGIN_SUITE(suite);

    const std::filesystem::path so_path = BuildSharedObject("DllLoaderPlugin");

    DllLoader loader;
    loader.LoadSharedObject(so_path.string());

    RUN_TEST(suite, "plugin recorded as loaded",
             loader.IsLoaded(so_path.string()));
    RUN_TEST(suite, "loaded count is one", loader.LoadedCount() == 1U);

    loader.LoadSharedObject(so_path.string());
    RUN_TEST(suite, "reloading same plugin keeps single handle",
             loader.LoadedCount() == 1U);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void RegisterTests()
{
    REGISTER_TEST(Test_LoadSharedObject);
}

} // namespace

int main()
{
    PRINT_TEST_HEADER("DllLoader");
    RegisterTests();

    for (int i = 0; i < TestUtils::GetRegisteredTestCount(); ++i)
    {
        TestUtils::RunRegisteredTest(i);
    }

    PRINT_SUMMARY();
    return (TestUtils::GetPassedTests() == TestUtils::GetTotalTests()) ? 0 : 1;
}
