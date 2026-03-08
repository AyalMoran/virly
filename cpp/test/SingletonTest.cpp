#include <atomic>
#include <iostream>
#include <thread>
#include <vector>

#include "Singleton.hpp"
#include "test_utils.hpp"

using namespace ilrd;

class TestSingletonTarget
{
  private:
    friend class Singleton<TestSingletonTarget>;

    TestSingletonTarget() : m_value(0)
    {
        ++s_ctor_calls;
    }

    ~TestSingletonTarget()
    {
        ++s_dtor_calls;
    }

  public:
    int GetValue() const
    {
        return m_value;
    }

    void SetValue(int value)
    {
        m_value = value;
    }

    static int CtorCalls()
    {
        return s_ctor_calls.load();
    }

    static int DtorCalls()
    {
        return s_dtor_calls.load();
    }

  private:
    int m_value;
    static std::atomic<int> s_ctor_calls;
    static std::atomic<int> s_dtor_calls;
};

std::atomic<int> TestSingletonTarget::s_ctor_calls(0);
std::atomic<int> TestSingletonTarget::s_dtor_calls(0);

void TestSameInstanceSequential()
{
    INIT_SUITE(suite, "Singleton Sequential");
    BEGIN_SUITE(suite);

    TestSingletonTarget* p1 = Singleton<TestSingletonTarget>::GetInstance();
    TestSingletonTarget* p2 = Singleton<TestSingletonTarget>::GetInstance();

    ASSERT_NOT_NULL(suite, p1);
    ASSERT_EQ(suite, p1, p2);
    ASSERT_EQ(suite, 1, TestSingletonTarget::CtorCalls());

    p1->SetValue(42);
    ASSERT_EQ(suite, 42, p2->GetValue());

    END_SUITE(suite);
}

void TestSameInstanceMultithreaded()
{
    INIT_SUITE(suite, "Singleton Multithreaded");
    BEGIN_SUITE(suite);

    const std::size_t num_threads = 32;
    std::vector<TestSingletonTarget*> results(num_threads, nullptr);
    std::vector<std::thread> threads;
    threads.reserve(num_threads);

    for (std::size_t i = 0; i < num_threads; ++i)
    {
        threads.push_back(std::thread([&results, i]() {
            results[i] = Singleton<TestSingletonTarget>::GetInstance();
        }));
    }

    for (std::size_t i = 0; i < threads.size(); ++i)
    {
        threads[i].join();
    }

    for (std::size_t i = 0; i < num_threads; ++i)
    {
        ASSERT_NOT_NULL(suite, results[i]);
        ASSERT_EQ(suite, results[0], results[i]);
    }

    ASSERT_EQ(suite, 1, TestSingletonTarget::CtorCalls());

    END_SUITE(suite);
}

void RegisterTests()
{
    REGISTER_TEST(TestSameInstanceSequential);
    REGISTER_TEST(TestSameInstanceMultithreaded);
}


int main()
{
    PRINT_TEST_HEADER("Singleton");
    RegisterTests();

    for (int i = 0; i < TestUtils::GetRegisteredTestCount(); ++i)
    {
        TestUtils::RunRegisteredTest(i);
    }

    PRINT_SUMMARY();

    return 0;
}
