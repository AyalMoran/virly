/**************************************************************
 * File    : SchedulerTest.cpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/ 

#include <atomic>
#include <chrono>
#include <functional>
#include <thread>
#include <vector>

#include "Scheduler.hpp"
#include "test_utils.hpp"

using namespace ilrd;
using namespace std::chrono;

namespace
{

class FunctionSchedulerTask : public Scheduler::ISchedulerTask
{
  public:
    explicit FunctionSchedulerTask(std::function<void()> fn)
        : m_fn(std::move(fn))
    {
    }

    void Execute() override
    {
        m_fn();
    }

  private:
    std::function<void()> m_fn;
};

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

void Test_HandletonInstance()
{
    INIT_SUITE(suite, "Scheduler Handleton");
    BEGIN_SUITE(suite);

    Scheduler* s1 = Scheduler::GetInstance();
    Scheduler* s2 = Scheduler::GetInstance();

    ASSERT_NOT_NULL(suite, s1);
    ASSERT_EQ(suite, s1, s2);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void Test_SingleTaskTiming()
{
    INIT_SUITE(suite, "Single Task Timing");
    BEGIN_SUITE(suite);

    Scheduler* sched = Scheduler::GetInstance();
    std::atomic<int> done(0);

    const steady_clock::time_point start = steady_clock::now();
    const milliseconds requested_delay(120);
    std::atomic<long long> elapsed_ms(-1);

    std::shared_ptr<Scheduler::ISchedulerTask> task(new FunctionSchedulerTask(
        [&done, &elapsed_ms, start]() {
            const auto elapsed = duration_cast<milliseconds>(
                steady_clock::now() - start);
            elapsed_ms.store(elapsed.count(), std::memory_order_release);
            done.fetch_add(1, std::memory_order_release);
        }));

    sched->AddTask(task, requested_delay);

    const bool completed = WaitForCount(done, 1, milliseconds(1000));
    RUN_TEST(suite, "task completed", completed);

    const long long actual = elapsed_ms.load(std::memory_order_acquire);
    RUN_TEST(suite, "elapsed >= 90ms", actual >= 90);
    RUN_TEST(suite, "elapsed <= 500ms", actual <= 500);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void Test_EarlierTaskPreemptsLater()
{
    INIT_SUITE(suite, "Earlier Task Preempts");
    BEGIN_SUITE(suite);

    Scheduler* sched = Scheduler::GetInstance();
    std::atomic<int> order_idx(0);
    std::atomic<int> early_order(-1);
    std::atomic<int> late_order(-1);
    std::atomic<int> done(0);

    std::shared_ptr<Scheduler::ISchedulerTask> late_task(
        new FunctionSchedulerTask([&]() {
            const int idx = order_idx.fetch_add(1, std::memory_order_relaxed);
            late_order.store(idx, std::memory_order_relaxed);
            done.fetch_add(1, std::memory_order_release);
        }));

    std::shared_ptr<Scheduler::ISchedulerTask> early_task(
        new FunctionSchedulerTask([&]() {
            const int idx = order_idx.fetch_add(1, std::memory_order_relaxed);
            early_order.store(idx, std::memory_order_relaxed);
            done.fetch_add(1, std::memory_order_release);
        }));

    sched->AddTask(late_task, milliseconds(350));
    std::this_thread::sleep_for(milliseconds(40));
    sched->AddTask(early_task, milliseconds(70));

    const bool completed = WaitForCount(done, 2, milliseconds(1500));
    RUN_TEST(suite, "both tasks completed", completed);
    RUN_TEST(suite, "early executed first", early_order.load() == 0);
    RUN_TEST(suite, "late executed second", late_order.load() == 1);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void Test_ConcurrentAddTaskStress()
{
    INIT_SUITE(suite, "Concurrent AddTask Stress");
    BEGIN_SUITE(suite);

    Scheduler* sched = Scheduler::GetInstance();
    std::atomic<int> done(0);

    const int thread_count = 8;
    const int tasks_per_thread = 20;
    const int total_tasks = thread_count * tasks_per_thread;

    std::vector<std::thread> adders;
    adders.reserve(thread_count);

    for (int i = 0; i < thread_count; ++i)
    {
        adders.push_back(std::thread([sched, &done, tasks_per_thread, i]() {
            for (int j = 0; j < tasks_per_thread; ++j)
            {
                const int delay_ms = (i + j) % 30;
                std::shared_ptr<Scheduler::ISchedulerTask> task(
                    new FunctionSchedulerTask([&done]() {
                        done.fetch_add(1, std::memory_order_release);
                    }));
                sched->AddTask(task, milliseconds(10 + delay_ms));
            }
        }));
    }

    for (int i = 0; i < thread_count; ++i)
    {
        adders[i].join();
    }

    const bool completed = WaitForCount(done, total_tasks, milliseconds(3000));
    RUN_TEST(suite, "all tasks completed", completed);
    RUN_TEST(suite, "completion count exact",
             done.load(std::memory_order_acquire) == total_tasks);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void RegisterTests()
{
    REGISTER_TEST(Test_HandletonInstance);
    REGISTER_TEST(Test_SingleTaskTiming);
    REGISTER_TEST(Test_EarlierTaskPreemptsLater);
    REGISTER_TEST(Test_ConcurrentAddTaskStress);
}

} // namespace

int main()
{
    PRINT_TEST_HEADER("Scheduler");
    RegisterTests();

    for (int i = 0; i < TestUtils::GetRegisteredTestCount(); ++i)
    {
        TestUtils::RunRegisteredTest(i);
    }

    PRINT_SUMMARY();
    return (TestUtils::GetPassedTests() == TestUtils::GetTotalTests()) ? 0 : 1;
}
