/**************************************************************
 * File    : Watchdog.c
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

#define _POSIX_C_SOURCE 200809L

#include "Watchdog.h"
#include "WDDebug.h"
#include "test_utils.h"
#include <assert.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>

#define RUNTIME_IN_SEC (600)
#define INTERVAL_IN_SEC (1)
#define THRESHOLD_IN_SEC (2)

static void KillProcessByName(const char* process_name);
static void RussianRoulette(void);
static void IHaveNothingToLiveFor(void);
static void WDSafeSleep(size_t seconds);
    /******************************************************
     * START OF ACTUAL TESTS
     ******************************************************/

    int main(int argc, char* argv[])
{
    size_t i = 0;
    pid_t pid = 0;
    wd_status_t status = WD_SUCCESS;

    SET_PRINT_COLOR(FG_MAGENTA);
        printf("starting...\n");
    SET_PRINT_COLOR(RESET);

        pid = getpid();

    SET_PRINT_COLOR(BRIGHT);
    SET_PRINT_COLOR(FG_YELLOW);
        printf("main process id: %d\n", pid);
    SET_PRINT_COLOR(RESET);

    if (WD_SUCCESS !=
        (status = WatchdogStart(INTERVAL_IN_SEC, THRESHOLD_IN_SEC, argv)))
    {
        SET_PRINT_COLOR(FG_RED);
        printf("WatchdogStart() failed\n");
        SET_PRINT_COLOR(RESET);

        return 1;
    }
    while (i != RUNTIME_IN_SEC)
    {
        SET_PRINT_COLOR(FG_BLUE);
            printf("critical section in the background...\n");
        SET_PRINT_COLOR(RESET);
        SET_PRINT_COLOR(BRIGHT);
        SET_PRINT_COLOR(FG_YELLOW);
            printf("main process id: %d\n", pid);
        SET_PRINT_COLOR(RESET);
        ++i;
        if (0 == i % 10)
        {
            SET_PRINT_COLOR(FG_RED);
            printf("Russian Roulette...\n");
            SET_PRINT_COLOR(RESET);
            RussianRoulette();
        }
        WDSafeSleep(1);
    }
    
    WatchdogStop();

    SET_PRINT_COLOR(FG_MAGENTA);
    printf("Exiting main process...\n");
    SET_PRINT_COLOR(RESET);
    fflush(stdout);

    (void) argc;
    (void) test_registry;
    (void) test_count;
    (void) total_tests;
    (void) passed_tests;
    return 0;
}

static void KillProcessByName(const char* process_name)
{
    char command[100];
    int sys = 0;
    sprintf(command, "pkill -9 -f %s", process_name);
    sys = system(command);
    printf("Processes matching '%s' terminated if found.\n", process_name);
    (void) sys;
}

static void IHaveNothingToLiveFor(void)
{
    printf("I have nothing to live for...\n");
    exit(0);
}

static void WDSafeSleep(size_t seconds)
{
    struct timespec req, rem;

    req.tv_sec = seconds;
    req.tv_nsec = 0;

    while (nanosleep(&req, &rem) == -1)
    {
        if (errno != EINTR)
        {
            /* on unexpected errors, stop trying */
            break;
        }
        req = rem;
    }
}

static void RussianRoulette(void)
{
    int gun = rand() % 6;

    if (gun == 0)
    {
        IHaveNothingToLiveFor();
    }
    else if (gun == 1)
    {
        KillProcessByName(WD_EXEC_PATH);
    }
    else
    {
        printf("Live to die another day...\n");
        return;
    }
}