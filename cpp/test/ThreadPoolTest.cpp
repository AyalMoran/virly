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
#include <thread>
#include <chrono>

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

static void Test_Stop(void)
{
    INIT_SUITE(suite, "ThreadPool Stop");
    BEGIN_SUITE(suite);

    SharedPtr<ThreadPool> pool(new ThreadPool(4));

    for (size_t i = 0; i < 2; ++i)
    {
        pool->AddTask(SharedPtr<ThreadPool::FunctionTask>(
                          new ThreadPool::FunctionTask([&]() { std::this_thread::sleep_for(std::chrono::seconds(1)); })),
                      UserPriority::HIGH);
    }

    std::this_thread::sleep_for(std::chrono::seconds(2));
    
    pool->StopNow();
    RUN_TEST(suite, "Pool is stopped", pool);
    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}


static void Test_GracefulStopDrainsQueuedTasks(void)
{
    INIT_SUITE(suite, "GracefulStop drains queued tasks");
    BEGIN_SUITE(suite);

    constexpr size_t kNumTasks = 64;
    std::atomic<size_t> executed(0);

    ThreadPool pool(2);
    for (size_t i = 0; i < kNumTasks; ++i)
    {
        pool.AddTask(SharedPtr<ThreadPool::FunctionTask>(
                         new ThreadPool::FunctionTask([&executed]() {
                             executed.fetch_add(1, std::memory_order_relaxed);
                         })),
                     UserPriority::LOW);
    }

    pool.Stop();

    RUN_TEST(suite, "all queued tasks were executed", executed.load() == kNumTasks);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

static void Test_GracefulStopRejectsNewTasks(void)
{
    INIT_SUITE(suite, "GracefulStop rejects new tasks");
    BEGIN_SUITE(suite);

    std::atomic<size_t> executed(0);
    ThreadPool pool(2);

    for (size_t i = 0; i < 16; ++i)
    {
        pool.AddTask(SharedPtr<ThreadPool::FunctionTask>(
                         new ThreadPool::FunctionTask([&executed]() {
                             std::this_thread::sleep_for(std::chrono::milliseconds(2));
                             executed.fetch_add(1, std::memory_order_relaxed);
                         })),
                     UserPriority::LOW);
    }

    pool.Stop();
    const size_t after_stop = executed.load(std::memory_order_relaxed);

    pool.AddTask(SharedPtr<ThreadPool::FunctionTask>(
                     new ThreadPool::FunctionTask([&executed]() {
                         executed.fetch_add(1000, std::memory_order_relaxed);
                     })),
                 UserPriority::HIGH);

    std::this_thread::sleep_for(std::chrono::milliseconds(30));
    RUN_TEST(suite, "AddTask after Stop is ignored",
             executed.load(std::memory_order_relaxed) == after_stop);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

static void Test_StopNowDoesNotHangWhenWorkersBlocked(void)
{
    INIT_SUITE(suite, "StopNow returns when workers blocked");
    BEGIN_SUITE(suite);

    ThreadPool pool(4);
    const auto start = std::chrono::steady_clock::now();
    pool.StopNow();
    const auto elapsed = duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - start);

    RUN_TEST(suite, "StopNow returned quickly", elapsed < std::chrono::milliseconds(500));

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

static void Test_StopNowCanPreemptBacklog(void)
{
    INIT_SUITE(suite, "StopNow preempts backlog");
    BEGIN_SUITE(suite);

    std::atomic<size_t> executed(0);
    ThreadPool pool(2);

    constexpr size_t kNumTasks = 200;
    for (size_t i = 0; i < kNumTasks; ++i)
    {
        pool.AddTask(SharedPtr<ThreadPool::FunctionTask>(
                         new ThreadPool::FunctionTask([&executed]() {
                             std::this_thread::sleep_for(std::chrono::milliseconds(10));
                             executed.fetch_add(1, std::memory_order_relaxed);
                         })),
                     UserPriority::LOW);
    }

    std::this_thread::sleep_for(std::chrono::milliseconds(25));
    pool.StopNow();

    RUN_TEST(suite, "not all queued tasks executed", executed.load() < kNumTasks);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

static void Test_FifoWithinSamePrioritySingleWorker(void)
{
    INIT_SUITE(suite, "FIFO within same priority");
    BEGIN_SUITE(suite);

    constexpr size_t kNumTasks = 64;
    std::vector<size_t> order(kNumTasks, static_cast<size_t>(-1));
    std::atomic<size_t> write_index(0);
    std::counting_semaphore<kNumTasks + 1> done(0);

    ThreadPool pool(1);
    for (size_t i = 0; i < kNumTasks; ++i)
    {
        pool.AddTask(SharedPtr<ThreadPool::FunctionTask>(
                         new ThreadPool::FunctionTask([&order, &write_index, &done, i]() {
                             const size_t idx = write_index.fetch_add(1, std::memory_order_relaxed);
                             if (idx < order.size())
                             {
                                 order[idx] = i;
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

    bool fifo = all_completed;
    for (size_t i = 0; i < kNumTasks && fifo; ++i)
    {
        if (order[i] != i)
        {
            fifo = false;
        }
    }

    RUN_TEST(suite, "all tasks completed", all_completed);
    RUN_TEST(suite, "execution order is FIFO", fifo);

    pool.Stop();

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

static void Test_PriorityBeatsFifoAcrossLevels(void)
{
    INIT_SUITE(suite, "Priority beats FIFO across levels");
    BEGIN_SUITE(suite);

    std::vector<int> order(9, -1);
    std::atomic<size_t> count(0);
    std::counting_semaphore<10> done(0);
    std::binary_semaphore gate_started(0);
    std::binary_semaphore gate_open(0);

    ThreadPool pool(1);

    pool.AddTask(SharedPtr<ThreadPool::FunctionTask>(
                     new ThreadPool::FunctionTask([&gate_started, &gate_open]() {
                         gate_started.release();
                         gate_open.acquire();
                     })),
                 AdminPriority::MAX);
    gate_started.acquire();

    auto push_mark = [&](int mark, const Priority& p)
    {
        pool.AddTask(SharedPtr<ThreadPool::FunctionTask>(
                         new ThreadPool::FunctionTask([&order, &count, &done, mark]() {
                             const size_t idx = count.fetch_add(1, std::memory_order_relaxed);
                             if (idx < order.size())
                             {
                                 order[idx] = mark;
                             }
                             done.release();
                         })),
                     p);
    };

    push_mark(1, UserPriority::LOW);
    push_mark(2, UserPriority::LOW);
    push_mark(3, UserPriority::LOW);
    push_mark(4, UserPriority::HIGH);
    push_mark(5, UserPriority::HIGH);
    push_mark(6, UserPriority::HIGH);
    push_mark(7, AdminPriority::MAX);
    push_mark(8, AdminPriority::MAX);
    push_mark(9, AdminPriority::MAX);
    gate_open.release();

    bool all_completed = true;
    for (size_t i = 0; i < 9; ++i)
    {
        if (!done.try_acquire_for(std::chrono::milliseconds(200)))
        {
            all_completed = false;
            break;
        }
    }

    bool grouped_by_priority = all_completed;
    if (grouped_by_priority)
    {
        grouped_by_priority =
            (order.size() == 9) &&
            (order[0] >= 7 && order[0] <= 9) &&
            (order[1] >= 7 && order[1] <= 9) &&
            (order[2] >= 7 && order[2] <= 9) &&
            (order[3] >= 4 && order[3] <= 6) &&
            (order[4] >= 4 && order[4] <= 6) &&
            (order[5] >= 4 && order[5] <= 6) &&
            (order[6] >= 1 && order[6] <= 3) &&
            (order[7] >= 1 && order[7] <= 3) &&
            (order[8] >= 1 && order[8] <= 3);
    }

    bool fifo_within_priority = all_completed;
    if (fifo_within_priority)
    {
        fifo_within_priority = (order[0] == 7 && order[1] == 8 && order[2] == 9 &&
                                order[3] == 4 && order[4] == 5 && order[5] == 6 &&
                                order[6] == 1 && order[7] == 2 && order[8] == 3);
    }

    RUN_TEST(suite, "all tasks completed", all_completed);
    RUN_TEST(suite, "higher priorities execute first", grouped_by_priority);
    RUN_TEST(suite, "FIFO preserved within each priority", fifo_within_priority);

    pool.Stop();

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

static void Test_MultipleStopIsOk(void)
{
    INIT_SUITE(suite, "Multiple Stop is OK");
    BEGIN_SUITE(suite);

    ThreadPool pool1(2);
    pool1.Stop();
    pool1.Stop();
    RUN_TEST(suite, "Stop can be called twice", true);

    ThreadPool pool2(2);
    pool2.StopNow();
    pool2.Stop();
    RUN_TEST(suite, "Stop after StopNow is safe", true);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

static void Test_DestructorIsGraceful(void)
{
    INIT_SUITE(suite, "Destructor is graceful");
    BEGIN_SUITE(suite);

    constexpr size_t kNumTasks = 48;
    std::atomic<size_t> executed(0);

    {
        ThreadPool pool(2);
        for (size_t i = 0; i < kNumTasks; ++i)
        {
            pool.AddTask(SharedPtr<ThreadPool::FunctionTask>(
                             new ThreadPool::FunctionTask([&executed]() {
                                 std::this_thread::sleep_for(std::chrono::milliseconds(1));
                                 executed.fetch_add(1, std::memory_order_relaxed);
                             })),
                         UserPriority::LOW);
        }
    } 

    RUN_TEST(suite, "all queued tasks finished before destruction",
             executed.load() == kNumTasks);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

static void Test_SetNumThreadsGrowAndShrink(void)
{
    INIT_SUITE(suite, "SetNumThreads grow and shrink");
    BEGIN_SUITE(suite);

    ThreadPool pool(4);
    std::atomic<int> executed(0);
    std::counting_semaphore<64> done(0);

    pool.SetNumThreads(2);

    for (int i = 0; i < 16; ++i)
    {
        pool.AddTask(SharedPtr<ThreadPool::FunctionTask>(
                         new ThreadPool::FunctionTask([&executed, &done]() {
                             executed.fetch_add(1, std::memory_order_relaxed);
                             done.release();
                         })),
                     UserPriority::LOW);
    }

    bool first_batch_done = true;
    for (int i = 0; i < 16; ++i)
    {
        if (!done.try_acquire_for(std::chrono::milliseconds(200)))
        {
            first_batch_done = false;
            break;
        }
    }

    pool.SetNumThreads(5);

    for (int i = 0; i < 16; ++i)
    {
        pool.AddTask(SharedPtr<ThreadPool::FunctionTask>(
                         new ThreadPool::FunctionTask([&executed, &done]() {
                             executed.fetch_add(1, std::memory_order_relaxed);
                             done.release();
                         })),
                     UserPriority::LOW);
    }

    bool second_batch_done = true;
    for (int i = 0; i < 16; ++i)
    {
        if (!done.try_acquire_for(std::chrono::milliseconds(200)))
        {
            second_batch_done = false;
            break;
        }
    }

    RUN_TEST(suite, "tasks complete after shrink", first_batch_done);
    RUN_TEST(suite, "tasks complete after grow", second_batch_done);
    RUN_TEST(suite, "all tasks executed", executed.load() == 32);

    pool.Stop();

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
    REGISTER_TEST(Test_Stop);
    REGISTER_TEST(Test_MultipleStopIsOk);
    REGISTER_TEST(Test_GracefulStopDrainsQueuedTasks);
    REGISTER_TEST(Test_GracefulStopRejectsNewTasks);
    REGISTER_TEST(Test_StopNowDoesNotHangWhenWorkersBlocked);
    REGISTER_TEST(Test_StopNowCanPreemptBacklog);
    REGISTER_TEST(Test_FifoWithinSamePrioritySingleWorker);
    REGISTER_TEST(Test_PriorityBeatsFifoAcrossLevels);
    REGISTER_TEST(Test_DestructorIsGraceful);
    REGISTER_TEST(Test_SetNumThreadsGrowAndShrink);
}
