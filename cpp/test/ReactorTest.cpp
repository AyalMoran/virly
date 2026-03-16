/**************************************************************
 * File    : ReactorTest.cpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    : 12-03-2026
 **************************************************************/

#include <stdexcept> // std::logic_error
#include <unistd.h>  // pipe

#include "Reactor.hpp"
#include "test_utils.hpp"

using namespace ilrd;

namespace
{

class PipePair
{
  public:
    PipePair()
    {
        if (0 != pipe(m_fds))
        {
            throw std::runtime_error("pipe() failed");
        }
    }

    ~PipePair()
    {
        close(m_fds[0]);
        close(m_fds[1]);
    }

    int ReadEnd() const
    {
        return m_fds[0];
    }

    int WriteEnd() const
    {
        return m_fds[1];
    }

    void WriteByte(char value) const
    {
        if (1 != write(m_fds[1], &value, 1))
        {
            throw std::runtime_error("write() failed");
        }
    }

    char ReadByte() const
    {
        char value = '\0';
        if (1 != read(m_fds[0], &value, 1))
        {
            throw std::runtime_error("read() failed");
        }

        return value;
    }

  private:
    int m_fds[2];
};

void Test_StopPreventsLaterCallbacks()
{
    INIT_SUITE(suite, "Stop Prevents Later Callbacks");
    BEGIN_SUITE(suite);

    LinuxFdListener listener;
    Reactor reactor(listener);
    PipePair stopPipe;
    PipePair removedPipe;

    int stopCount = 0;
    int removedCount = 0;

    reactor.AddFd(removedPipe.ReadEnd(), IListener::READ,
                  [&](int fd, IListener::Mode mode) {
                      (void)fd;
                      (void)mode;
                      ++removedCount;
                      removedPipe.ReadByte();
                  });

    reactor.AddFd(stopPipe.ReadEnd(), IListener::READ,
                  [&](int fd, IListener::Mode mode) {
                      (void)fd;
                      (void)mode;
                      ++stopCount;
                      stopPipe.ReadByte();
                      reactor.RemoveFd(removedPipe.ReadEnd(), IListener::READ);
                      reactor.RemoveFd(stopPipe.ReadEnd(), IListener::READ);
                      reactor.Stop();
                  });

    removedPipe.WriteByte('r');
    stopPipe.WriteByte('s');

    reactor.Run();

    RUN_TEST(suite, "stop callback invoked once", 1 == stopCount);
    RUN_TEST(suite, "removed callback skipped", 0 == removedCount);
    RUN_TEST(suite, "callbacks removed before return", reactor.Size() == 0);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void Test_SelfRemoveAndOverwrite()
{
    INIT_SUITE(suite, "Self Remove And Overwrite");
    BEGIN_SUITE(suite);

    LinuxFdListener listener;
    Reactor reactor(listener);
    PipePair selfRemovePipe;

    int selfRemoveCount = 0;

    reactor.AddFd(selfRemovePipe.ReadEnd(), IListener::READ,
                  [&](int, IListener::Mode) { selfRemoveCount = -10; });
    reactor.AddFd(selfRemovePipe.ReadEnd(), IListener::READ,
                  [&](int, IListener::Mode) {
                      ++selfRemoveCount;
                      selfRemovePipe.ReadByte();
                      reactor.RemoveFd(selfRemovePipe.ReadEnd(),
                                       IListener::READ);
                  });

    selfRemovePipe.WriteByte('x');
    reactor.Run();

    RUN_TEST(suite, "second add overwrote first action", 1 == selfRemoveCount);
    RUN_TEST(suite, "callback removed itself", reactor.Size() == 0);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void Test_AddWithinCallbackHandledInSameRun()
{
    INIT_SUITE(suite, "Add Within Callback Handled In Same Run");
    BEGIN_SUITE(suite);

    LinuxFdListener listener;
    Reactor reactor(listener);
    PipePair firstPipe;
    PipePair secondPipe;

    int firstCount = 0;
    int secondCount = 0;

    reactor.AddFd(firstPipe.ReadEnd(), IListener::READ,
                  [&](int, IListener::Mode) {
                      ++firstCount;
                      firstPipe.ReadByte();
                      reactor.RemoveFd(firstPipe.ReadEnd(), IListener::READ);
                      secondPipe.WriteByte('b');
                      reactor.AddFd(secondPipe.ReadEnd(), IListener::READ,
                                    [&](int, IListener::Mode) {
                                        ++secondCount;
                                        secondPipe.ReadByte();
                                        reactor.RemoveFd(secondPipe.ReadEnd(),
                                                         IListener::READ);
                                    });
                  });

    firstPipe.WriteByte('a');
    reactor.Run();

    RUN_TEST(suite, "first callback ran", 1 == firstCount);
    RUN_TEST(suite, "second callback also ran", 1 == secondCount);
    RUN_TEST(suite, "reactor drained after same run", reactor.Size() == 0);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void Test_SequentialRunAllowed()
{
    INIT_SUITE(suite, "Sequential Run Allowed");
    BEGIN_SUITE(suite);

    LinuxFdListener listener;
    Reactor reactor(listener);
    PipePair firstPipe;
    PipePair secondPipe;

    int firstCount = 0;
    int secondCount = 0;

    reactor.AddFd(firstPipe.ReadEnd(), IListener::READ,
                  [&](int, IListener::Mode) {
                      ++firstCount;
                      firstPipe.ReadByte();
                      reactor.RemoveFd(firstPipe.ReadEnd(), IListener::READ);
                  });

    firstPipe.WriteByte('a');
    reactor.Run();

    reactor.AddFd(secondPipe.ReadEnd(), IListener::READ,
                  [&](int, IListener::Mode) {
                      ++secondCount;
                      secondPipe.ReadByte();
                      reactor.RemoveFd(secondPipe.ReadEnd(), IListener::READ);
                  });

    secondPipe.WriteByte('b');
    reactor.Run();

    RUN_TEST(suite, "first run completed", 1 == firstCount);
    RUN_TEST(suite, "second run completed", 1 == secondCount);
    RUN_TEST(suite, "reactor drained after sequential runs", reactor.Size() == 0);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void Test_RunReentryThrows()
{
    INIT_SUITE(suite, "Run Reentry Throws");
    BEGIN_SUITE(suite);

    LinuxFdListener listener;
    Reactor reactor(listener);
    PipePair pipePair;

    bool threw = false;

    reactor.AddFd(pipePair.ReadEnd(), IListener::READ,
                  [&](int, IListener::Mode) {
                      pipePair.ReadByte();
                      try
                      {
                          reactor.Run();
                      }
                      catch (const std::logic_error&)
                      {
                          threw = true;
                      }
                      reactor.RemoveFd(pipePair.ReadEnd(), IListener::READ);
                  });

    pipePair.WriteByte('z');
    reactor.Run();

    RUN_TEST(suite, "nested run rejected", threw);
    RUN_TEST(suite, "reactor no longer running", !reactor.IsRunning());

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void RegisterTests()
{
    REGISTER_TEST(Test_StopPreventsLaterCallbacks);
    REGISTER_TEST(Test_SelfRemoveAndOverwrite);
    REGISTER_TEST(Test_AddWithinCallbackHandledInSameRun);
    REGISTER_TEST(Test_SequentialRunAllowed);
    REGISTER_TEST(Test_RunReentryThrows);
}

} // namespace

int main()
{
    PRINT_TEST_HEADER("Reactor");
    RegisterTests();

    for (int i = 0; i < TestUtils::GetRegisteredTestCount(); ++i)
    {
        TestUtils::RunRegisteredTest(i);
    }

    PRINT_SUMMARY();
    return (TestUtils::GetPassedTests() == TestUtils::GetTotalTests()) ? 0 : 1;
}
