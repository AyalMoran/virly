#include "Net/SignalManager.hpp"

#include <cstring>

volatile sig_atomic_t SignalManager::s_stopRequested = 0;

void SignalManager::HandleSignal(int signum)
{
    (void)signum;
    s_stopRequested = 1;
}

void SignalManager::InstallHandlers()
{
    struct sigaction action;
    std::memset(&action, 0, sizeof(action));
    action.sa_handler = &SignalManager::HandleSignal;

    sigaction(SIGINT, &action, NULL);
    sigaction(SIGTERM, &action, NULL);
}

bool SignalManager::IsStopRequested()
{
    return s_stopRequested != 0;
}
