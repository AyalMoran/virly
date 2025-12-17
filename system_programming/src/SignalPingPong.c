/**************************************************************
 * File    : SignalPingPong.c
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/
#define _POSIX_C_SOURCE 200809L

#include <assert.h> /* assert() */
#include <stddef.h> /* size_t   */
#include <stdlib.h> /* malloc() */
#include <string.h> /* memset() */

/*============================ INCLUDES ============================*/
#include "SignalPingPong.h"

#include <assert.h> /* assert       */
#include <limits.h>
#include <signal.h>    /* sigaction    */
#include <stdio.h>     /* perror       */
#include <stdlib.h>    /* exit         */
#include <string.h>    /* memset       */
#include <sys/types.h> /* pid_t        */
#include <sys/wait.h>  /* waitpid      */
#include <unistd.h>    /* fork         */

#include "SignalPingPong.h" /* SignalPingPong        */

#define TRUE (1)
#define FALSE (0)
#define ERROR (-1)
#define PING (SIGUSR1)
#define PONG (SIGUSR2)

#define PING_PONG_ROUNDS (INT_MAX)

static sig_atomic_t got_usr1 = FALSE;
static sig_atomic_t got_usr2 = FALSE;
static pid_t child_pid = -1;
static pid_t parent_pid = -1;
static size_t g_num_rounds = 0;

static void HandleSIGUSR(int signum);
static void HandleSIGUSR2(int signum);
static void SafePrint(int);
static void ParentLoop(void);
static void ChildLoop(void);
static void InstallHandlers(int flags);
static void InstallHandlersPING(int flags);
static void InstallHandlersPONG(int flags);

static sigset_t BlockUSRSignals(void);

int SignalPingPong(size_t num_rounds)
{
    sigset_t old_mask = {0};
    int status = 0;

    InstallHandlers(SA_RESTART);

    g_num_rounds = num_rounds;
    parent_pid = getpid();
    old_mask = BlockUSRSignals();

    child_pid = fork();
    if (ERROR == child_pid)
    {
        perror("fork error");
        return EXIT_FAILURE;
    }
    if (0 == child_pid)
    {
        sigprocmask(SIG_SETMASK, &old_mask, NULL);
        ChildLoop();
        exit(EXIT_SUCCESS);
    }

    assert(0 == kill(child_pid, PING));

    sigprocmask(SIG_SETMASK, &old_mask, NULL);

    ParentLoop();
    waitpid(child_pid, &status, 0);

    return EXIT_SUCCESS;
}

static void HandleSIGUSR(int signum)
{
    if (PONG == signum)
    {
        got_usr2 = TRUE;
    }
    else
    {
        got_usr1 = TRUE;
    }
}

static void InstallHandlers(int flags)
{
    struct sigaction sa = {0};
    memset((void*) &sa, 0, sizeof(sa));

    sa.sa_flags = flags;
    sa.sa_handler = HandleSIGUSR;

    sigaction(PING, &sa, NULL);
    sigaction(PONG, &sa, NULL);
}

static void InstallHandlersPING(int flags)
{
    struct sigaction sa = {0};
    memset((void*) &sa, 0, sizeof(sa));

    sa.sa_flags = flags;
    sa.sa_handler = HandleSIGUSR;

    sigaction(PING, &sa, NULL);
}
static void InstallHandlersPONG(int flags)
{
    struct sigaction sa = {0};
    memset((void*) &sa, 0, sizeof(sa));

    sa.sa_flags = flags;
    sa.sa_handler = HandleSIGUSR;

    sigaction(PONG, &sa, NULL);
}

static sigset_t BlockUSRSignals(void)
{
    sigset_t new_mask = {0};
    sigset_t old_mask = {0};

    sigemptyset(&new_mask);
    sigaddset(&new_mask, PING);
    sigaddset(&new_mask, PONG);
    sigprocmask(SIG_BLOCK, &new_mask, &old_mask);

    return old_mask;
}

static void ParentLoop(void)
{
    sigset_t block_sig = BlockUSRSignals();
    sigset_t old_mask = {0};
    unsigned int round = 0;

    assert(0 == sigprocmask(SIG_SETMASK, &block_sig, NULL));

    while (round < g_num_rounds)
    {
        while (FALSE == got_usr2)
        {
            sigsuspend(&old_mask);
        }
        got_usr2 = FALSE;
        ++round;

        assert(0 == sigprocmask(SIG_BLOCK, &block_sig, NULL));
        assert(0 == kill(child_pid, PING));
    }
    assert(0 == sigprocmask(SIG_SETMASK, &old_mask, NULL));
}

static void ChildLoop(void)
{
    sigset_t block_sig = {0};
    sigset_t old_mask = {0};
    unsigned int round = 0;

    sigemptyset(&block_sig);
    sigaddset(&block_sig, PING);

    assert(0 == sigprocmask(SIG_BLOCK, &block_sig, &old_mask));
    InstallHandlersPING(SA_RESTART);

    while (round < g_num_rounds)
    {
        while (FALSE == got_usr1)
        {
            sigsuspend(&old_mask);
        }
        got_usr1 = FALSE;
        ++round;

        SafePrint(round);
        assert(0 == sigprocmask(SIG_BLOCK, &block_sig, NULL));
        assert(0 == kill(parent_pid, PONG));
    }
    assert(0 == sigprocmask(SIG_SETMASK, &old_mask, NULL));
}

static void SafePrint(int round)
{
    char buf[64];
    int n = snprintf(buf, sizeof(buf), "%u\n", round);
    if (n > 0)
    {
        write(STDOUT_FILENO, buf, (size_t) n);
    }
}
