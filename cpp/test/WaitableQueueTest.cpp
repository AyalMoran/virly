/**************************************************************
 * File    : WaitableQueueTest.cpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

#include <atomic>
#include <chrono>
#include <iostream>
#include <thread>
#include <vector>

#include "PriorityQueue.hpp"
#include "WaitableQueue.hpp"
#include "test_utils.hpp"

using namespace std::chrono;

static void RegisterTests(void);

static void TestStartsEmpty(void)
{
    INIT_SUITE(suite, "Starts Empty");
    BEGIN_SUITE(suite);

    ilrd::WaitableQueue<int> queue;
    RUN_TEST(suite, "is empty", queue.IsEmpty());

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

static void TestPushPopSingle(void)
{
    INIT_SUITE(suite, "Push Pop Single");
    BEGIN_SUITE(suite);

    ilrd::WaitableQueue<int> queue;
    int value = 0;

    queue.Push(42);
    RUN_TEST(suite, "not empty", !queue.IsEmpty());

    queue.Pop(value);
    RUN_TEST(suite, "value is 42", value == 42);
    RUN_TEST(suite, "empty again", queue.IsEmpty());

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

static void TestPriorityOrderWithPriorityContainer(void)
{
    INIT_SUITE(suite, "Priority Container");
    BEGIN_SUITE(suite);

    ilrd::WaitableQueue<int, ilrd::PriorityQueue<int>> queue;
    int value = 0;

    queue.Push(3);
    queue.Push(9);
    queue.Push(5);

    queue.Pop(value);
    RUN_TEST(suite, "first is max", value == 9);

    queue.Pop(value);
    RUN_TEST(suite, "second is next max", value == 5);

    queue.Pop(value);
    RUN_TEST(suite, "third is last", value == 3);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

static void TestPopBlocksUntilPush(void)
{
    INIT_SUITE(suite, "Blocking Pop");
    BEGIN_SUITE(suite);

    ilrd::WaitableQueue<int> queue;
    std::atomic<bool> pop_done(false);
    int popped = 0;

    std::thread consumer(
        [&]()
        {
            queue.Pop(popped);
            pop_done = true;
        });

    std::this_thread::sleep_for(milliseconds(80));
    RUN_TEST(suite, "pop is blocked", !pop_done);

    queue.Push(99);
    consumer.join();

    RUN_TEST(suite, "pop completed", pop_done);
    RUN_TEST(suite, "value is 99", popped == 99);
    RUN_TEST(suite, "empty after pop", queue.IsEmpty());

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

static void TestProducerConsumer(void)
{
    INIT_SUITE(suite, "Producer Consumer");
    BEGIN_SUITE(suite);

#define MILLION (1000000)
    ilrd::WaitableQueue<int> wq;
    alignas(64) std::atomic<long long> sum(0);
    alignas(64) std::atomic<long long> popped(0);
    const int NUM_PRODUCERS = NPROD;
    const int NUM_CONSUMERS = CONS;

    RUN_TEST(suite, "valid thread counts", NUM_PRODUCERS > 0 && NUM_CONSUMERS > 0);
    if (NUM_PRODUCERS <= 0 || NUM_CONSUMERS <= 0)
    {
        END_SUITE(suite);
        PRINT_SUITE_SUMMARY(suite);
        return;
    }

    const int kCount = 99 * MILLION;
    const long long perProducerSum = (static_cast<long long>(kCount) * (kCount + 1)) / 2;
    const long long expected = perProducerSum * NUM_PRODUCERS;
    const long long totalItems = static_cast<long long>(kCount + 1) * NUM_PRODUCERS;
    const long long basePopsPerConsumer = totalItems / NUM_CONSUMERS;
    const long long remainderPops = totalItems % NUM_CONSUMERS;

    std::vector<std::thread> producers;
    std::vector<std::thread> consumers;
    producers.reserve(NUM_PRODUCERS);
    consumers.reserve(NUM_CONSUMERS);
    for (int i = 0; i < NUM_PRODUCERS; ++i)
    {
        producers.emplace_back([&]() {
            for (int j = 0; j <= kCount; ++j)
            {
                wq.Push(j);
            }
        });
    }
    for (int i = 0; i < NUM_CONSUMERS; ++i)
    {
        const long long popsForThisConsumer = basePopsPerConsumer + (i < remainderPops ? 1 : 0);
        consumers.emplace_back([&wq, &sum, &popped, popsForThisConsumer]() {
            for (long long j = 0; j < popsForThisConsumer; ++j)
            {
                int value = 0;
                wq.Pop(value);
                sum.fetch_add(value, std::memory_order_relaxed);
                popped.fetch_add(1, std::memory_order_relaxed);
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

    RUN_TEST(suite, "all items popped", popped.load() == totalItems);
    RUN_TEST(suite, "sum matches", sum.load() == expected);
    std::cout << "Sum: " << sum.load() << std::endl;
    std::cout << "Expected: " << expected << std::endl;
    RUN_TEST(suite, "queue empty", wq.IsEmpty());

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

int main(void)
{
    PRINT_TEST_HEADER("WaitableQueue");
    std::cout << "===================\n";

    RegisterTests();

    for (int i = 0; i < TestUtils::GetRegisteredTestCount(); ++i)
    {
        std::cout << "Running Suite: " << TestUtils::GetRegisteredTestName(i)
                  << std::endl;
        TestUtils::RunRegisteredTest(i);
    }

    PRINT_SUMMARY();

    return (TestUtils::GetPassedTests() == TestUtils::GetTotalTests()) ? 0 : 1;
}

static void RegisterTests(void)
{
    //  REGISTER_TEST(TestStartsEmpty);
    //  REGISTER_TEST(TestPushPopSingle);
    //  REGISTER_TEST(TestPriorityOrderWithPriorityContainer);
    //  REGISTER_TEST(TestPopBlocksUntilPush);
    REGISTER_TEST(TestProducerConsumer);
}
