  /**************************************************************
 * File    : Ping.c
 * Author  : Ayal Moran
 * Reviewer: Osri F.
 * Date    : 17-12-2025
**************************************************************/
#define _POSIX_C_SOURCE 200809L

#include <assert.h> /* assert       */
#include <signal.h> /* sigwaitinfo  */
#include <stdio.h>  /* printf       */
#include <stdlib.h> /* exit         */
#include <string.h> /* memset       */
#include <unistd.h> /* write        */

#define PING_PONG_ROUNDS (999999999)
#define TRUE (1)
#define FALSE (0)
#define ERROR (-1)

static void SafePrint(char const* msg);
static void SafePrintINT(int round);

int main(void)
{
    sigset_t mask = {0};
    siginfo_t info = {0};
    pid_t pong_pid = -1;
    int rounds = 0;

    assert(0 == sigemptyset(&mask));
    assert(0 == sigaddset(&mask, SIGUSR1));
    assert(0 == sigaddset(&mask, SIGUSR2));
    assert(0 == sigprocmask(SIG_BLOCK, &mask, NULL));

    printf("ping pid %d\n", getpid());

    while (rounds < PING_PONG_ROUNDS)
    {
        sigwaitinfo(&mask, &info);

        if (SIGUSR1 == info.si_signo)
        {
            if (-1 == pong_pid)
            {
                pong_pid = info.si_pid;
            }

            SafePrint("ping: got SIGUSR1, sending SIGUSR2\n");
            SafePrintINT(rounds);

            assert(0 == kill(pong_pid, SIGUSR2));
            ++rounds;
        }
    }

    return EXIT_SUCCESS;
}

static void SafePrint(char const* msg)
{
    size_t len = 0;

    while ('\0' != msg[len])
    {
        ++len;
    }
    write(STDOUT_FILENO, msg, len);
}
static void SafePrintINT(int round)
{
    char buf[64] = {0};
    int n = snprintf(buf, sizeof(buf), "%u\n", round);
    if (n > 0)
    {
        assert(ERROR != write(STDOUT_FILENO, buf, (size_t) n));
    }
}