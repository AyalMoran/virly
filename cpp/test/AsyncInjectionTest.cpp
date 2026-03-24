/**************************************************************
 * File    : AsyncInjectionTest.cpp
 * Author  : Ayal Moran
 * Reviewer: 
 * Date    : 2026-03-22
**************************************************************/

#include <atomic>
#include <chrono>
#include <thread>
#include <type_traits>

#include "AsyncInjection.hpp"
#include "test_utils.hpp"

using namespace ilrd;
using namespace std::chrono;

namespace
{

bool WaitForCount(const std::atomic<int>& value, int target, milliseconds timeout)
{
    const steady_clock::time_point deadline = steady_clock::now() + timeout;

    while (steady_clock::now() < deadline)
    {
        if (value.load(std::memory_order_acquire) >= target)
        {
            return true;
        }

        std::this_thread::sleep_for(milliseconds(2));
    }

    return value.load(std::memory_order_acquire) >= target;
}

void Test_HeapOnlyContract()
{
    INIT_SUITE(suite, "Heap Only Contract");
    BEGIN_SUITE(suite);

    RUN_TEST(suite, "type is not publicly destructible",
             !std::is_destructible<AsyncInjection>::value);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void Test_ReschedulesUntilActionSucceeds()
{
    INIT_SUITE(suite, "Reschedule Until Success");
    BEGIN_SUITE(suite);

    std::atomic<int> attempts(0);
    const milliseconds interval(30);

    new AsyncInjection(
        [&attempts]() {
            const int run_number =
                attempts.fetch_add(1, std::memory_order_acq_rel) + 1;
            return run_number >= 3;
        },
        interval);

    const bool completed = WaitForCount(attempts, 3, milliseconds(1500));
    RUN_TEST(suite, "action executed until success", completed);

    std::this_thread::sleep_for(milliseconds(150));
    RUN_TEST(suite, "task stops rescheduling after success",
             attempts.load(std::memory_order_acquire) == 3);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void RegisterTests()
{
    REGISTER_TEST(Test_HeapOnlyContract);
    REGISTER_TEST(Test_ReschedulesUntilActionSucceeds);
}

} // namespace

int main()
{
    PRINT_TEST_HEADER("AsyncInjection");
    RegisterTests();

    for (int i = 0; i < TestUtils::GetRegisteredTestCount(); ++i)
    {
        TestUtils::RunRegisteredTest(i);
    }

    PRINT_SUMMARY();
    return (TestUtils::GetPassedTests() == TestUtils::GetTotalTests()) ? 0 : 1;
}
