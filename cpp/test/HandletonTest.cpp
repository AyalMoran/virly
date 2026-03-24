/**************************************************************
 * File    : HandletonTest.cpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    : 16-03-2026
 **************************************************************/

#include "Handleton.hpp"
#include "../other/handleton/CorrectPlugin.hpp"
#include "ThreadPool.hpp"
#include "test_utils.hpp"
#include <dlfcn.h>
#include <iostream>

static void RegisterTests(void);

/******************************************************
 * START OF ACTUAL TESTS
 ******************************************************/
/*static void Test_DirectAccess(void)
{
    using namespace ilrd;

    INIT_SUITE(direct_access, "Direct Access");

    ThreadPool* instance = Handleton<ThreadPool>::GetInstance();
    ThreadPool* instance2 = Handleton<ThreadPool>::GetInstance();

    RUN_TEST(direct_access, "Addresses are the same",
             Handleton<ThreadPool>::GetInstance() == instance);
    RUN_TEST(direct_access, "Addresses are the same",
             Handleton<ThreadPool>::GetInstance() == instance2);

    std::cout << "== " << direct_access.name << direct_access.passed << "/"
              << direct_access.total << " Passed ==" << std::endl;

    END_SUITE(direct_access);
}

static void Test_PluginAccess(void)
{
    using namespace ilrd;

    INIT_SUITE(plugin_access, "Plugin Access");

    PrintHandletonFromPlugin();
    std::cout << Handleton<ThreadPool>::GetInstance() << std::endl;

    std::cout << "== " << plugin_access.name << plugin_access.passed << "/"
              << plugin_access.total << " Passed ==" << std::endl;

    END_SUITE(plugin_access);
}*/

static void Test_ExplicitLinking(void)
{
    using namespace ilrd;

    INIT_SUITE(explicit_linking, "Explicit Linking");

    ThreadPool* instance = Handleton<ThreadPool>::GetInstance();

    void* handle = dlopen("/home/moranayal/repos/ILRD/git/cpp/build/CorrectPlugin.so", RTLD_LAZY);
    if (!handle)
    {
        std::cerr << "dlopen failed: " << dlerror() << std::endl;
        RUN_TEST(explicit_linking, "dlopen failed", false);
    }

    ThreadPool* (*getInstanceFromPlugin)() = (ThreadPool* (*)())dlsym(handle, "GetInstanceFromPlugin");
    if (!getInstanceFromPlugin)
    {
        std::cerr << "dlsym failed: " << dlerror() << std::endl;
        RUN_TEST(explicit_linking, "dlsym failed", false);
    }
    ThreadPool* instance2 = getInstanceFromPlugin();

    RUN_TEST(explicit_linking, "instance is not NULL", instance != NULL);
    RUN_TEST(explicit_linking, "instance is the same as the one from the main program", instance == instance2);

    if (dlclose(handle) != 0)
    {
        std::cerr << "dlclose failed: " << dlerror() << std::endl;
        
        RUN_TEST(explicit_linking, "dlclose failed", false);
    }

    std::cout << "== " << explicit_linking.name << explicit_linking.passed
              << "/" << explicit_linking.total << " Passed ==" << std::endl;
}

int main(void)
{
    int i = 0;

    PRINT_TEST_HEADER("Handleton");
    printf("===================\n");

    RegisterTests();

    for (i = 0; i < TestUtils::GetRegisteredTestCount(); ++i)
    {
        std::cout << "Running Suite: " << TestUtils::GetRegisteredTestName(i)
                  << std::endl;
        TestUtils::RunRegisteredTest(i);
    }

    PRINT_SUMMARY();

    return 0;
}

static void RegisterTests(void)
{
    //REGISTER_TEST(Test_DirectAccess);
    //REGISTER_TEST(Test_PluginAccess);
    REGISTER_TEST(Test_ExplicitLinking);
}
