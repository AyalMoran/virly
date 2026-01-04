/**************************************************************
 * File    : Watchdog.c
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/types.h>


#include "test_utils.h"
#include "Watchdog.h"
#include "WDDebug.h"

#define RUNTIME_IN_SEC (500)
#define INTERVAL_IN_SEC (3)
#define THRESHOLD_IN_SEC (2)

static void KillProcessByName(const char *process_name);
static void RussianRoulette(void);
static void IHaveNothingToLiveFor(void);
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
    
     if(WD_SUCCESS != (status = WatchdogStart(INTERVAL_IN_SEC, THRESHOLD_IN_SEC, argv)))
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
         if(0 == i % 7)
         {
             SET_PRINT_COLOR(FG_RED);
             printf("Russian Roulette...\n");
             SET_PRINT_COLOR(RESET);
             RussianRoulette();
        }
         sleep(1);
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

 static void KillProcessByName(const char *process_name) {
    char command[100];
    sprintf(command, "pkill -9 -f %s", process_name);
    system(command);
    printf("Processes matching '%s' terminated if found.\n", process_name);
}

static void IHaveNothingToLiveFor(void)
{
    MAIN_DBG_PRINT("I have nothing to live for...\n");
    exit(0);
}

static void RussianRoulette(void)
{
    int gun = 0;
    gun = rand() % 6;
    if(gun == 0)
    {
        IHaveNothingToLiveFor();
    }
    else if(gun == 1)
    {
        KillProcessByName(WD_EXEC_PATH);
    }
    else 
    {
        MAIN_DBG_PRINT("Live to die another day...\n");
        return;
    }
}