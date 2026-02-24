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
 
 #include "WaitableQueue.hpp"
 #include "PriorityQueue.hpp"
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
 
     ilrd::WaitableQueue<int, ilrd::PriorityQueue<int> > queue;
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
 
     std::thread consumer([&]() {
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
 
     ilrd::WaitableQueue<int> queue;
     std::atomic<long long> sum(0);
     const int kCount = 1000;
     const long long expected = (static_cast<long long>(kCount) * (kCount + 1)) / 2;
 
     std::thread producer([&]() {
         for (int i = 1; i <= kCount; ++i)
         {
             queue.Push(i);
         }
     });
 
     std::thread consumer([&]() {
         int value = 0;
         for (int i = 1; i <= kCount; ++i)
         {
             queue.Pop(value);
             sum += value;
         }
     });
 
     producer.join();
     consumer.join();
 
     RUN_TEST(suite, "sum matches", sum == expected);
     RUN_TEST(suite, "queue empty", queue.IsEmpty());
 
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
     REGISTER_TEST(TestStartsEmpty);
     REGISTER_TEST(TestPushPopSingle);
     REGISTER_TEST(TestPriorityOrderWithPriorityContainer);
     REGISTER_TEST(TestPopBlocksUntilPush);
     REGISTER_TEST(TestProducerConsumer);
 }
 