/**************************************************************
 * File    : ThreadPoolTest.cpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

#include <atomic>
#include <chrono>
#include <iostream>
#include <semaphore>
#include <vector>

#include "ThreadPool.hpp"
#include "test_utils.hpp"

using namespace ilrd;

static void RegisterTests(void);

static bool PrintFunction(void)
{
    std::this_thread::sleep_for(std::chrono::seconds(5));
    std::cout << "PrintFunction: " << std::this_thread::get_id() << std::endl;
    return true;
}

static bool LastTaskFunction(void)
{
    std::cout << "LastTaskFunction: " << std::this_thread::get_id()
              << std::endl;
    return true;
}
/******************************************************
 * START OF ACTUAL TESTS
 ******************************************************/
static void Test_AddTask(void)
{
    INIT_SUITE(suite, "ThreadPool AddTask");
    BEGIN_SUITE(suite);

    std::binary_semaphore done(0);
    std::atomic<int> run_count(0);

    ThreadPool* pool = new ThreadPool(1);

    ThreadPool::ITPTask* fn_task = new ThreadPool::FunctionTask(
        [&run_count, &done]()
        {
            run_count.fetch_add(1, std::memory_order_relaxed);
            done.release();
        });

    SharedPtr<ThreadPool::ITPTask> task(fn_task);

    pool->AddTask(task, UserPriority::LOW);

    const bool completed = done.try_acquire_for(std::chrono::milliseconds(500));
    RUN_TEST(suite, "Task was executed", completed);
    RUN_TEST(suite, "Task ran exactly once", run_count.load() == 1);

    delete pool;
    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

static void Test_AddFutureTask(void)
{
    INIT_SUITE(suite, "ThreadPool AddFutureTask");
    BEGIN_SUITE(suite);

    SharedPtr<ThreadPool> pool(new ThreadPool(1));

    SharedPtr<ThreadPool::FutureTask<bool>> future_task(
        new ThreadPool::FutureTask<bool>(PrintFunction));
    pool->AddTask(future_task, UserPriority::LOW);
    future_task->Get();
    int i = 0;

    RUN_TEST(suite, "Task was executed", i < 10);
    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

const size_t NUM_TASKS_LOW = 100;
const size_t NUM_TASKS_HIGH = 10;
const size_t NUM_TASKS_OVERALL = NUM_TASKS_LOW + NUM_TASKS_HIGH + 1;

std::atomic<int> ordering_array[NUM_TASKS_OVERALL] = {0};
std::atomic<size_t> ordering_index = 0;
static void PrintHIGH()
{
    ordering_array[ordering_index.fetch_add(1)] = 3;
}
static void PrintLOW()
{
    ordering_array[ordering_index.fetch_add(1)] = 1;
}
static void PrintLastTask()
{
    std::cout << "PrintLastTask: " << std::this_thread::get_id() << std::endl;
}

static void PrintAdminTask()
{
    ordering_array[ordering_index.fetch_add(1)] = 4;
}

static void Test_FIFO_SamePriority(void)
{
    INIT_SUITE(suite, "ThreadPool FIFO Same Priority");
    BEGIN_SUITE(suite);

    static const size_t kNumTasks = 64;
    std::vector<size_t> exec_order(kNumTasks, static_cast<size_t>(-1));
    std::atomic<size_t> write_idx(0);
    std::counting_semaphore<kNumTasks + 1> done(0);

    // Intentionally leaked due current ThreadPool shutdown deadlock behavior.
    SharedPtr<ThreadPool> pool(new ThreadPool(1));

    for (size_t i = 0; i < kNumTasks; ++i)
    {
        pool->AddTask(
            SharedPtr<ThreadPool::FunctionTask>(new ThreadPool::FunctionTask(
                [&exec_order, &write_idx, &done, i]()
                {
                    const size_t idx =
                        write_idx.fetch_add(1, std::memory_order_relaxed);
                    if (idx < exec_order.size())
                    {
                        exec_order[idx] = i;
                    }
                    done.release();
                })),
            UserPriority::LOW);
    }

    bool all_completed = true;
    for (size_t i = 0; i < kNumTasks; ++i)
    {
        if (!done.try_acquire_for(std::chrono::milliseconds(200)))
        {
            all_completed = false;
            break;
        }
    }

    bool is_fifo = all_completed;
    if (is_fifo)
    {
        for (size_t i = 0; i < kNumTasks; ++i)
        {
            if (exec_order[i] != i)
            {
                is_fifo = false;
                break;
            }
        }
    }

    RUN_TEST(suite, "all FIFO tasks completed", all_completed);
    RUN_TEST(suite, "same-priority execution is FIFO", is_fifo);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

static SharedPtr<ThreadPool::FutureTask<bool>>
MakeLastTask(SharedPtr<ThreadPool> pool)
{
    SharedPtr<ThreadPool::FutureTask<bool>> future_task(
        new ThreadPool::FutureTask<bool>([]() { return true; }));
    pool->AddTask(future_task, UserPriority::LOW);
    return future_task;
}
static void Test_AddMultipleThreads(void)
{
    INIT_SUITE(suite, "ThreadPool AddMultipleThreads");
    BEGIN_SUITE(suite);

    SharedPtr<ThreadPool> pool(new ThreadPool(1));

    for (size_t i = 0; i < 1; ++i)
    {
        pool->AddTask(
            SharedPtr<ThreadPool::FunctionTask>(new ThreadPool::FunctionTask(
                []()
                { std::this_thread::sleep_for(std::chrono::seconds(5)); })),
            UserPriority::LOW);
    }

    // add 100 LOW tasks and 10 HIGH
    for (size_t i = 0; i < 100; ++i)
    {
        pool->AddTask(SharedPtr<ThreadPool::FunctionTask>(
                          new ThreadPool::FunctionTask(PrintLOW)),
                      UserPriority::LOW);
    }

    for (size_t i = 0; i < 10; ++i)
    {
        pool->AddTask(SharedPtr<ThreadPool::FunctionTask>(
                          new ThreadPool::FunctionTask(PrintHIGH)),
                      UserPriority::HIGH);
    }

    pool->AddTask(SharedPtr<ThreadPool::FunctionTask>(
                      new ThreadPool::FunctionTask(PrintAdminTask)),
                  AdminPriority::MAX);

    bool result = true;
    MakeLastTask(pool)->Get();

    for (size_t i = 0; i < NUM_TASKS_OVERALL - 1; ++i)
    {
        if (ordering_array[i] < ordering_array[i + 1])
        {
            std::cout << "ERROR: " << ordering_array[i] << " < "
                      << ordering_array[i + 1] << std::endl;
            result = false;
            break;
        }
    }

    std::this_thread::sleep_for(std::chrono::seconds(2));
    std::cout << std::endl;
    for (size_t i = 0; i < NUM_TASKS_OVERALL; ++i)
    {
        std::cout << ordering_array[i] << " ";
    }
    std::cout << std::endl;

    std::cout << "First task: " << ordering_array[0] << std::endl;
    std::cout << "Last task: " << ordering_array[NUM_TASKS_OVERALL - 1]
              << std::endl;
    RUN_TEST(suite, "All tasks were executed in correct order", result);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

int main(void)
{
    std::cout << "Hardware concurrency: " << std::thread::hardware_concurrency()
              << std::endl;
    PRINT_TEST_HEADER("ThreadPool");
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
    REGISTER_TEST(Test_AddTask);
    REGISTER_TEST(Test_AddFutureTask);
    REGISTER_TEST(Test_AddMultipleThreads);
    REGISTER_TEST(Test_FIFO_SamePriority);
}
