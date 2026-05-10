#include "test_utils.hpp"

#include <cstdlib>
#include <iostream>

namespace TestUtils
{

static int total_tests = 0;
static int passed_tests = 0;
static NamedTest test_registry[MAX_TESTS];
static int test_count = 0;

void SetPrintColor(int code)
{
    std::cout << "\x1b[" << code << "m";
}

void PrintTestHeader(const char* name)
{
    SetPrintColor(Color::BRIGHT);
    SetPrintColor(Color::FG_BLUE);
    SetPrintColor(Color::BG_YELLOW);
    std::cout << "=====STARTING " << name << " TESTS=====";
    std::cout << "===================\n";
    SetPrintColor(Color::RESET);
    std::cout << "\n";
}

void Trace(const char* file, int line)
{
    std::cout << "[TRACE] " << file << ":" << line << "\n";
}

void ShowInt(const char* name, int value)
{
    std::cout << "Value of " << name << " is " << value << "\n";
}

void ShowChar(const char* name, char value)
{
    std::cout << "Value of " << name << " is " << value << "\n";
}

void ShowSize(const char* name, size_t value)
{
    std::cout << "Size of " << name << " is "
              << static_cast<unsigned long>(value) << "\n";
}

void ShowSizeT(const char* name, size_t value)
{
    std::cout << "Value of " << name << " is "
              << static_cast<unsigned long>(value) << "\n";
}

void ShowPtr(const char* name, const void* value)
{
    std::cout << "Value of " << name << " is " << value << "\n";
}

void ShowStr(const char* name, const char* value)
{
    std::cout << "Value of " << name << " is " << value << "\n";
}

void ShowFloat(const char* name, float value)
{
    std::cout << "Value of " << name << " is " << value << "\n";
}

void ShowDouble(const char* name, double value)
{
    std::cout << "Value of " << name << " is " << value << "\n";
}

void ShowLong(const char* name, long value)
{
    std::cout << "Value of " << name << " is " << value << "\n";
}

void ShowULong(const char* name, unsigned long value)
{
    std::cout << "Value of " << name << " is " << value << "\n";
}

void RunTest(TestSuite& suite, const char* desc, bool result, int line,
             const char* file)
{
    (void)file;
    ++suite.total;
    ++total_tests;
    if (result)
    {
        ++suite.passed;
        ++passed_tests;
        SetPrintColor(Color::FG_GREEN);
        SetPrintColor(Color::BRIGHT);
        std::cout << "[PASS] " << desc << " [line " << line << "]\n";
    }
    else
    {
        SetPrintColor(Color::FG_RED);
        SetPrintColor(Color::BRIGHT);
        std::cout << "[FAIL] " << desc << " [line " << line << "]\n";
    }
    SetPrintColor(Color::RESET);
}

TestSuite MakeSuite(const char* name)
{
    TestSuite suite;
    suite.name = name;
    suite.total = 0;
    suite.passed = 0;
    return suite;
}

void BeginSuite(const TestSuite& suite)
{
    SetPrintColor(Color::BRIGHT);
    SetPrintColor(Color::FG_BLUE);
    std::cout << "\n========== BEGIN SUITE: " << suite.name << " ==========\n\n";
    SetPrintColor(Color::RESET);
}

void EndSuite(const TestSuite& suite)
{
    SetPrintColor(Color::BRIGHT);
    SetPrintColor(Color::FG_BLUE);
    std::cout << "\n========== END SUITE: " << suite.name << " ==========\n\n";
    SetPrintColor(Color::RESET);
}

void PrintSuiteSummary(const TestSuite& suite)
{
    std::cout << "== [" << suite.name << "] " << suite.passed << "/"
              << suite.total << " Passed ==\n";
}

void RegisterTest(const char* name, TestFunc func)
{
    if (test_count < MAX_TESTS)
    {
        test_registry[test_count].name = name;
        test_registry[test_count].func = func;
        ++test_count;
    }
    else
    {
        std::cerr << "[ERROR] Max test limit reached\n";
        std::exit(1);
    }
}

void PrintSummary()
{
    SetPrintColor(Color::BRIGHT);
    if (passed_tests == total_tests)
    {
        SetPrintColor(Color::FG_GREEN);
        std::cout << "=== All tests passed (" << passed_tests << "/"
                  << total_tests << ") ===\n";
    }
    else
    {
        SetPrintColor(Color::FG_YELLOW);
        std::cout << "=== Partial success (" << passed_tests << "/"
                  << total_tests << ") ===\n";
    }
    SetPrintColor(Color::RESET);
}

int GetTotalTests()
{
    return total_tests;
}

int GetPassedTests()
{
    return passed_tests;
}

int GetRegisteredTestCount()
{
    return test_count;
}

const char* GetRegisteredTestName(int index)
{
    if (index >= 0 && index < test_count)
    {
        return test_registry[index].name;
    }

    return "";
}

void RunRegisteredTest(int index)
{
    if (index >= 0 && index < test_count)
    {
        test_registry[index].func();
    }
}

} // namespace TestUtils
