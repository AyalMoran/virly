#ifndef ILRD_TEST_UTILS_HPP
#define ILRD_TEST_UTILS_HPP

#include <cstddef>
#include <cstdio>
#include <cstring>
#include <iostream>

namespace TestUtils {

/* Constants */
const int MAX_TESTS = 30;

/* Color codes (ANSI) */
namespace Color {
const int RESET = 0;
const int BRIGHT = 1;
const int DIM = 2;
const int UNDERSCORE = 3;
const int BLINK = 4;
const int REVERSE = 5;
const int HIDDEN = 6;
const int FG_BLACK = 30;
const int FG_RED = 31;
const int FG_GREEN = 32;
const int FG_YELLOW = 33;
const int FG_BLUE = 34;
const int FG_MAGENTA = 35;
const int FG_CYAN = 36;
const int FG_WHITE = 37;
const int BG_BLACK = 40;
const int BG_RED = 41;
const int BG_GREEN = 42;
const int BG_YELLOW = 43;
const int BG_BLUE = 44;
const int BG_MAGENTA = 45;
const int BG_CYAN = 46;
const int BG_WHITE = 47;
}  // namespace Color

/* Types */
struct TestSuite {
    const char* name;
    int total;
    int passed;
};

typedef void (*TestFunc)(void);

struct NamedTest {
    const char* name;
    TestFunc func;
};

/* Output and colors */
void SetPrintColor(int code);
void PrintTestHeader(const char* name);

/* Value prints and debugging */
void Trace(const char* file, int line);
void ShowInt(const char* name, int value);
void ShowChar(const char* name, char value);
void ShowSize(const char* name, size_t value);
void ShowSizeT(const char* name, size_t value);
void ShowPtr(const char* name, const void* value);
void ShowStr(const char* name, const char* value);
void ShowFloat(const char* name, float value);
void ShowDouble(const char* name, double value);
void ShowLong(const char* name, long value);
void ShowULong(const char* name, unsigned long value);

/* Test run and assertions*/
void RunTest(TestSuite& suite,
             const char* desc,
             bool result,
             int line,
             const char* file);

/* Test suite lifecycle */
TestSuite MakeSuite(const char* name);
void BeginSuite(const TestSuite& suite);
void EndSuite(const TestSuite& suite);
void PrintSuiteSummary(const TestSuite& suite);

/* Test registry */
void RegisterTest(const char* name, TestFunc func);
void PrintSummary();

/* Counts */
int GetTotalTests();
int GetPassedTests();

/* Test registry iteration */
int GetRegisteredTestCount();
const char* GetRegisteredTestName(int index);
void RunRegisteredTest(int index);

}  // namespace TestUtils

/* ---------------------------------------------------------------------------
 * Convenience macros
 * --------------------------------------------------------------------------- */


#define RUN_TEST(suite, desc, expr) \
    TestUtils::RunTest((suite), (desc), (expr) != 0, __LINE__, __FILE__)

#define ASSERT_TRUE(suite, expr) \
    TestUtils::RunTest((suite), #expr, (expr) != 0, __LINE__, __FILE__)

#define ASSERT_FALSE(suite, expr) \
    TestUtils::RunTest((suite), #expr, (expr) == 0, __LINE__, __FILE__)

#define ASSERT_EQ(suite, expected, actual) \
    TestUtils::RunTest((suite), #expected " == " #actual, (expected) == (actual), __LINE__, __FILE__)

#define ASSERT_NEQ(suite, expected, actual) \
    TestUtils::RunTest((suite), #expected " != " #actual, (expected) != (actual), __LINE__, __FILE__)

#define ASSERT_NULL(suite, ptr) \
    TestUtils::RunTest((suite), #ptr " == NULL", (ptr) == nullptr, __LINE__, __FILE__)

#define ASSERT_NOT_NULL(suite, ptr) \
    TestUtils::RunTest((suite), #ptr " != NULL", (ptr) != nullptr, __LINE__, __FILE__)

#define ASSERT_STR_EQ(suite, expected, actual) \
    TestUtils::RunTest((suite), #expected " == " #actual, std::strcmp((expected), (actual)) == 0, __LINE__, __FILE__)

#define ASSERT_MEM_EQ(suite, ptr1, ptr2, size) \
    TestUtils::RunTest((suite), "memcmp(" #ptr1 ", " #ptr2 ", " #size ") == 0", std::memcmp(ptr1, ptr2, size) == 0, __LINE__, __FILE__)

#define TEST_CASE(name) \
    do { std::cout << "\n--- Running Test: " #name " ---\n"; } while (0)


#define INIT_SUITE(suite_var, suite_name) \
    TestUtils::TestSuite suite_var = TestUtils::MakeSuite(suite_name)

#define BEGIN_SUITE(suite) \
    TestUtils::BeginSuite(suite)

#define END_SUITE(suite) \
    TestUtils::EndSuite(suite)

#define PRINT_SUITE_SUMMARY(suite) \
    TestUtils::PrintSuiteSummary(suite)

#define REGISTER_TEST(funct) \
    TestUtils::RegisterTest(#funct, (funct))

#define PRINT_SUMMARY() \
    TestUtils::PrintSummary()

#define PRINT_TEST_HEADER(name) \
    TestUtils::PrintTestHeader(name)

#define TRACE() \
    TestUtils::Trace(__FILE__, __LINE__)

#define SHOW_INT(x) TestUtils::ShowInt(#x, (x))
#define SHOW_CHAR(x) TestUtils::ShowChar(#x, (x))
#define SHOW_SIZE(x) TestUtils::ShowSize(#x, sizeof(x))
#define SHOW_SIZET(x) TestUtils::ShowSizeT(#x, (x))
#define SHOW_PTR(x) TestUtils::ShowPtr(#x, static_cast<const void*>(x))
#define SHOW_STR(x) TestUtils::ShowStr(#x, (x))
#define SHOW_FLOAT(x) TestUtils::ShowFloat(#x, (x))
#define SHOW_DOUBLE(x) TestUtils::ShowDouble(#x, (x))
#define SHOW_LONG(x) TestUtils::ShowLong(#x, (x))
#define SHOW_ULONG(x) TestUtils::ShowULong(#x, (x))

#endif /* ILRD_TEST_UTILS_HPP */
