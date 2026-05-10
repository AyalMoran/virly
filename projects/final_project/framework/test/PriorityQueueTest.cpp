/**************************************************************
 * File    : PriorityQueueTest.cpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

#include <atomic>
#include <functional>
#include <iostream>
#include <thread>
#include <vector>

#include "PriorityQueue.hpp"
#include "WaitableQueue.hpp"
#include "test_utils.hpp"

static void RegisterTests(void);

static void TestMaxBehavior(void)
{
    INIT_SUITE(suite, "Max Heap Behavior");
    BEGIN_SUITE(suite);

    ilrd::PriorityQueue<int> pq;
    RUN_TEST(suite, "starts empty", pq.empty());

    pq.push(3);
    pq.push(7);
    pq.push(1);

    RUN_TEST(suite, "not empty after push", !pq.empty());
    RUN_TEST(suite, "max is on top", pq.front() == 7);

    pq.pop();
    RUN_TEST(suite, "next max after pop", pq.front() == 3);

    pq.pop();
    RUN_TEST(suite, "last value remains", pq.front() == 1);

    pq.pop();
    RUN_TEST(suite, "empty after all pops", pq.empty());

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

static void TestCustomComparator(void)
{
    INIT_SUITE(suite, "Custom Comparator");
    BEGIN_SUITE(suite);

    ilrd::PriorityQueue<int, std::vector<int>, std::greater<int>> min_pq;

    min_pq.push(5);
    min_pq.push(2);
    min_pq.push(9);

    RUN_TEST(suite, "custom comparator works", min_pq.front() == 2);

    min_pq.pop();
    RUN_TEST(suite, "next min after pop", min_pq.front() == 5);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

static void TestThreadsWithWaitableQueue(void)
{
    INIT_SUITE(suite, "Threads");
    BEGIN_SUITE(suite);

    ilrd::WaitableQueue<int, ilrd::PriorityQueue<int>> wq;
    std::atomic<long long> sum(0);

    const int NUM_PRODUCERS = 2;
    const int NUM_CONSUMERS = 2;
    const int kCount = 10000000;
    const long long expected = (static_cast<long long>(kCount) * (kCount + 1)) / 2 * NUM_PRODUCERS;


    std::thread producers[NUM_PRODUCERS];
    std::thread consumers[NUM_CONSUMERS];
    for (int i = 0; i < NUM_PRODUCERS; ++i)
    {
        producers[i] = std::thread([&]() {
            for (int j = 0; j <= kCount; ++j)
            {
                wq.Push(j);
            }
        });
    }
    for (int i = 0; i < NUM_CONSUMERS; ++i)
    {
        consumers[i] = std::thread([&]() {
            for (int j = 0; j <= kCount; ++j)
            {
                int value = 0;
                if (wq.Pop(std::chrono::milliseconds(1),value))
                {
                    sum += value;
                }
                else
                {
                    --j;
                }
            }
        });
    }
    std::cout << "Producers and consumers created" << std::endl;
    for (int i = 0; i < NUM_PRODUCERS; ++i)
    {
        producers[i].join();
    }
    for (int i = 0; i < NUM_CONSUMERS; ++i)
    {
        consumers[i].join();
    }

    RUN_TEST(suite, "sum matches", sum == expected);
    std::cout << "Sum: " << sum << std::endl;
    std::cout << "Expected: " << expected << std::endl;
    RUN_TEST(suite, "queue empty", wq.IsEmpty());

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

int main(void)
{
    PRINT_TEST_HEADER("PriorityQueue");
    std::cout << "===================\n";

    RegisterTests();

    for (int i = 0; i < TestUtils::GetRegisteredTestCount(); ++i)
    {
        std::cout << "Running Suite: " << TestUtils::GetRegisteredTestName(i) << std::endl;
        TestUtils::RunRegisteredTest(i);
    }

    PRINT_SUMMARY();

    return (TestUtils::GetPassedTests() == TestUtils::GetTotalTests()) ? 0 : 1;
}

static void RegisterTests(void)
{
    REGISTER_TEST(TestMaxBehavior);
    REGISTER_TEST(TestCustomComparator);
    REGISTER_TEST(TestThreadsWithWaitableQueue);
}
