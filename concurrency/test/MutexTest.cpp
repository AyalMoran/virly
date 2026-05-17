/**************************************************************
 * File    : MutexTest.cpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

#include <atomic>
#include <chrono>
#include <cstddef>
#include <memory>
#include <thread>
#include <vector>

#include "Mutex.hpp"
#include "test_utils.hpp"

namespace
{

const std::size_t BASIC_THREADS = 8;
const std::size_t BASIC_ITERATIONS = 50000;
const std::size_t STRESS_THREADS = 16;
const std::size_t STRESS_ITERATIONS = 25000;
const std::size_t VECTOR_SIZE = 128;

void JoinAll(std::vector<std::thread>& threads)
{
    for (std::size_t i = 0; i < threads.size(); ++i)
    {
        if (threads[i].joinable())
        {
            threads[i].join();
        }
    }
}

void TestBasicLockUnlock()
{
    INIT_SUITE(suite, "Basic Lock Unlock");
    BEGIN_SUITE(suite);

    ilrd::Mutex mutex;
    int value = 0;

    mutex.lock();
    value = 42;
    mutex.unlock();

    ASSERT_EQ(suite, 42, value);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void TestMutualExclusionCounter()
{
    INIT_SUITE(suite, "Mutual Exclusion Counter");
    BEGIN_SUITE(suite);

    ilrd::Mutex mutex;
    std::size_t counter = 0;
    std::vector<std::thread> threads;
    threads.reserve(BASIC_THREADS);

    for (std::size_t i = 0; i < BASIC_THREADS; ++i)
    {
        threads.push_back(std::thread(
            [&mutex, &counter]()
            {
                for (std::size_t j = 0; j < BASIC_ITERATIONS; ++j)
                {
                    mutex.lock();
                    ++counter;
                    mutex.unlock();
                }
            }));
    }

    JoinAll(threads);

    ASSERT_EQ(suite, BASIC_THREADS * BASIC_ITERATIONS, counter);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void TestCriticalSectionExclusivity()
{
    INIT_SUITE(suite, "Critical Section Exclusivity");
    BEGIN_SUITE(suite);

    ilrd::Mutex mutex;
    std::atomic<int> inside_count(0);
    std::atomic<int> violations(0);
    std::vector<std::thread> threads;
    threads.reserve(STRESS_THREADS);

    for (std::size_t i = 0; i < STRESS_THREADS; ++i)
    {
        threads.push_back(std::thread(
            [&mutex, &inside_count, &violations]()
            {
                for (std::size_t j = 0; j < STRESS_ITERATIONS; ++j)
                {
                    mutex.lock();
                    if (1 != inside_count.fetch_add(1, std::memory_order_acq_rel) + 1)
                    {
                        violations.fetch_add(1, std::memory_order_relaxed);
                    }

                    std::this_thread::yield();

                    if (1 != inside_count.load(std::memory_order_acquire))
                    {
                        violations.fetch_add(1, std::memory_order_relaxed);
                    }
                    inside_count.fetch_sub(1, std::memory_order_acq_rel);
                    mutex.unlock();
                }
            }));
    }

    JoinAll(threads);

    ASSERT_EQ(suite, 0, violations.load());
    ASSERT_EQ(suite, 0, inside_count.load());

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void TestDataIntegrityUnderLoad()
{
    INIT_SUITE(suite, "Data Integrity Under Load");
    BEGIN_SUITE(suite);

    ilrd::Mutex mutex;
    std::vector<std::size_t> buckets(VECTOR_SIZE, 0);
    std::size_t total = 0;
    std::vector<std::thread> threads;
    threads.reserve(STRESS_THREADS);

    for (std::size_t i = 0; i < STRESS_THREADS; ++i)
    {
        threads.push_back(std::thread(
            [i, &mutex, &buckets, &total]()
            {
                for (std::size_t j = 0; j < STRESS_ITERATIONS; ++j)
                {
                    const std::size_t index = (i * STRESS_ITERATIONS + j) % buckets.size();

                    mutex.lock();
                    ++buckets[index];
                    ++total;
                    mutex.unlock();
                }
            }));
    }

    JoinAll(threads);

    std::size_t checksum = 0;
    for (std::size_t i = 0; i < buckets.size(); ++i)
    {
        checksum += buckets[i];
    }

    ASSERT_EQ(suite, STRESS_THREADS * STRESS_ITERATIONS, total);
    ASSERT_EQ(suite, total, checksum);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void TestAcquiresAfterUnlock()
{
    INIT_SUITE(suite, "Acquires After Unlock");
    BEGIN_SUITE(suite);

    std::shared_ptr<ilrd::Mutex> mutex(new ilrd::Mutex);
    std::atomic<bool> acquired(false);
    std::atomic<bool> release_waiter(false);

    mutex->lock();
    std::thread waiter(
        [mutex, &acquired, &release_waiter]()
        {
            mutex->lock();
            acquired.store(true, std::memory_order_release);
            while (!release_waiter.load(std::memory_order_acquire))
            {
                std::this_thread::yield();
            }
            mutex->unlock();
        });

    std::this_thread::sleep_for(std::chrono::milliseconds(80));
    RUN_TEST(suite, "waiter blocked while mutex is locked",
             !acquired.load(std::memory_order_acquire));

    mutex->unlock();

    const std::chrono::steady_clock::time_point deadline =
        std::chrono::steady_clock::now() + std::chrono::seconds(2);
    while (!acquired.load(std::memory_order_acquire) &&
           std::chrono::steady_clock::now() < deadline)
    {
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }

    RUN_TEST(suite, "waiter acquired after unlock",
             acquired.load(std::memory_order_acquire));

    release_waiter.store(true, std::memory_order_release);
    if (acquired.load(std::memory_order_acquire))
    {
        waiter.join();
    }
    else
    {
        waiter.detach();
    }

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void TestRepeatedConstruction()
{
    INIT_SUITE(suite, "Repeated Construction");
    BEGIN_SUITE(suite);

    int value = 0;

    for (std::size_t i = 0; i < 10000; ++i)
    {
        ilrd::Mutex mutex;
        mutex.lock();
        ++value;
        mutex.unlock();
    }

    ASSERT_EQ(suite, 10000, value);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void RegisterTests()
{
    REGISTER_TEST(TestBasicLockUnlock);
    REGISTER_TEST(TestMutualExclusionCounter);
    REGISTER_TEST(TestCriticalSectionExclusivity);
    REGISTER_TEST(TestDataIntegrityUnderLoad);
    REGISTER_TEST(TestAcquiresAfterUnlock);
    REGISTER_TEST(TestRepeatedConstruction);
}

} // namespace

int main()
{
    PRINT_TEST_HEADER("Mutex");
    RegisterTests();

    for (int i = 0; i < TestUtils::GetRegisteredTestCount(); ++i)
    {
        TestUtils::RunRegisteredTest(i);
    }

    PRINT_SUMMARY();

    return (TestUtils::GetPassedTests() == TestUtils::GetTotalTests()) ? 0 : 1;
}
