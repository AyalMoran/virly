#ifndef NET_SIGNAL_MANAGER_HPP
#define NET_SIGNAL_MANAGER_HPP

#include <signal.h>

class SignalManager
{
  public:
    static void InstallHandlers();
    static bool IsStopRequested();

  private:
    static void HandleSignal(int signum);

  private:
    static volatile sig_atomic_t s_stopRequested;
};

#endif
