/**************************************************************
 * File    : PingFork.c
 * Author  : Ayal Moran
 * Reviewer: Osri F.
 * Date    : 17-12-2025
 **************************************************************/
#define _POSIX_C_SOURCE 200809L

#include <assert.h> /* assert       */
#include <limits.h> /* INT_MAX      */
#include <signal.h> /* sigwaitinfo  */
#include <stdio.h>  /* printf       */
#include <stdlib.h> /* exit         */
#include <string.h> /* memset       */
#include <unistd.h> /* write        */

#define PING_PONG_ROUNDS (999999999)
#define TRUE (1)
#define FALSE (0)
#define ERROR (-1)
#define EXEC_FAILURE (1)
#define IS_CHILD(pid) (0 == pid)
#define PONG_EXE ("./bin/Pong")

static void SafePrint(char const* msg);
static void SafePrintINT(int round);

int main(void)
{
    sigset_t mask = {0};
    siginfo_t info = {0};
    pid_t pong_pid = -1;
    int rounds = 0;
    char* pong_args = NULL;
    char pid_buf[32] = {0};
    int n = 0;
    char* argv[3] = {0};

    assert(0 == sigemptyset(&mask));
    assert(0 == sigaddset(&mask, SIGUSR1));
    assert(0 == sigaddset(&mask, SIGUSR2));
    assert(0 == sigprocmask(SIG_BLOCK, &mask, NULL));

    pong_pid = fork();
    if (0 > pong_pid)
    {
        perror("fork error");
        return ERROR;
    }
    else if (IS_CHILD(pong_pid))
    {
        n = snprintf(pid_buf, sizeof(pid_buf), "%d", getppid());
        if (n < 0 || (size_t) n >= sizeof(pid_buf))
        {
            perror("snprintf error");
            return ERROR;
        }

        argv[0] = (char*) PONG_EXE;
        argv[1] = pid_buf;
        argv[2] = NULL;

        execvp(PONG_EXE, argv);
        perror("execvp");
        exit(EXEC_FAILURE);
    }
    else
    {
        assert(0 == kill(pong_pid, SIGUSR2));

        while (rounds < PING_PONG_ROUNDS)
        {
            sigwaitinfo(&mask, &info);

            if (SIGUSR1 == info.si_signo)
            {
                SafePrint("ping: got SIGUSR1, sending SIGUSR2\n");

                assert(0 == kill(pong_pid, SIGUSR2));
                SafePrintINT(rounds);
                ++rounds;
            }
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
