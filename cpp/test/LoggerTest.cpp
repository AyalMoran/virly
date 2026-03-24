/**************************************************************
 * File    : LoggerTest.cpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

#include <memory>
#include <mutex>
#include <regex>
#include <string.h>
#include <string>
#include <thread>
#include <unistd.h>
#include <vector>

#include "Logger.hpp"
#include "test_utils.hpp"

using ilrd::Logger;

namespace
{

class VectorSink : public Logger::Sink
{
  public:
    VectorSink() : m_mutex(), m_lines()
    {
    }

    void Write(const std::string& formatted_line) override
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        m_lines.push_back(formatted_line);
    }

    void Flush() override
    {
    }

    std::vector<std::string> Snapshot() const
    {
        std::lock_guard<std::mutex> lock(m_mutex);
        return m_lines;
    }

  private:
    mutable std::mutex m_mutex;
    std::vector<std::string> m_lines;
};

void TestSingletonIdentity()
{
    INIT_SUITE(suite, "Logger Singleton Identity");
    BEGIN_SUITE(suite);

    Logger& logger1 = Logger::Instance();
    Logger& logger2 = Logger::Instance();

    ASSERT_EQ(suite, &logger1, &logger2);

    END_SUITE(suite);
}

void TestLogFormat()
{
    INIT_SUITE(suite, "Logger Format");
    BEGIN_SUITE(suite);

    std::shared_ptr<VectorSink> sink = std::make_shared<VectorSink>();
    Logger& logger = Logger::Instance();
    logger.SetSink(sink);

    ASSERT_TRUE(suite, logger.Log("formatted message", Logger::Level::ERROR));
    logger.Flush();

    const std::vector<std::string> lines = sink->Snapshot();
    ASSERT_EQ(suite, static_cast<std::size_t>(1), lines.size());

    const std::regex pattern(
        "^[0-9]{8} : [0-9]{2} : [0-9]{2} : [0-9]{2} \\[ERROR\\] "
        "formatted message$");
    ASSERT_TRUE(suite, std::regex_match(lines[0], pattern));

    END_SUITE(suite);
}

void TestMultithreadedLogging()
{
    INIT_SUITE(suite, "Logger Multithreaded Delivery");
    BEGIN_SUITE(suite);

    const std::size_t num_threads = 8;
    const std::size_t logs_per_thread = 50;
    std::shared_ptr<VectorSink> sink = std::make_shared<VectorSink>();
    Logger& logger = Logger::Instance();
    logger.SetSink(sink);

    std::vector<std::thread> threads;
    threads.reserve(num_threads);

    for (std::size_t i = 0; i < num_threads; ++i)
    {
        threads.push_back(std::thread([i, logs_per_thread, &logger]() {
            for (std::size_t j = 0; j < logs_per_thread; ++j)
            {
                logger.Log("thread " + std::to_string(i) + " log " +
                               std::to_string(j),
                           Logger::Level::INFO);
            }
        }));
    }

    for (std::size_t i = 0; i < threads.size(); ++i)
    {
        threads[i].join();
    }

    logger.Flush();

    const std::vector<std::string> lines = sink->Snapshot();
    ASSERT_EQ(suite, num_threads * logs_per_thread, lines.size());

    END_SUITE(suite);
}

void TestFdSink()
{
    INIT_SUITE(suite, "Logger File Descriptor Sink");
    BEGIN_SUITE(suite);

    int pipe_fds[2] = {-1, -1};
    const int pipe_status = pipe(pipe_fds);
    ASSERT_EQ(suite, 0, pipe_status);

    Logger& logger = Logger::Instance();
    logger.SetFd(pipe_fds[1]);
    ASSERT_TRUE(suite, logger.Log("fd message", Logger::Level::WARNING));
    logger.Flush();

    close(pipe_fds[1]);
    pipe_fds[1] = -1;

    char buffer[256] = {0};
    const ssize_t bytes_read = read(pipe_fds[0], buffer, sizeof(buffer) - 1);
    ASSERT_TRUE(suite, 0 < bytes_read);
    close(pipe_fds[0]);
    pipe_fds[0] = -1;

    ASSERT_TRUE(suite, nullptr != strstr(buffer, "[WARNING] fd message\n"));

    END_SUITE(suite);
}

void RegisterTests()
{
    REGISTER_TEST(TestSingletonIdentity);
    REGISTER_TEST(TestLogFormat);
    REGISTER_TEST(TestMultithreadedLogging);
    REGISTER_TEST(TestFdSink);
}

} // namespace

int main()
{
    PRINT_TEST_HEADER("Logger");
    RegisterTests();

    for (int i = 0; i < TestUtils::GetRegisteredTestCount(); ++i)
    {
        TestUtils::RunRegisteredTest(i);
    }

    PRINT_SUMMARY();

    return 0;
}
