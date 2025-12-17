  /**************************************************************
 * File    : ${NAME}_test.c
 * Author  : Ayal Moran
 * Reviewer: 
 * Date    : 
**************************************************************/
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>

#include "SignalPingPong.h"
#include "test_utils.h"

static void RegisterTests(void);

  /******************************************************
 * START OF ACTUAL TESTS
 ******************************************************/
static void TimePingPongs(void)
{
    INIT_SUITE(time, "TIMING");

    SignalPingPong(999999);

    printf("== [%s] %d/%d Passed ==\n", time.name,
        time.passed, time.total);
}

int main(void)
{
    int i=0;
    
    PRINT_TEST_HEADER("OVERALL");
    printf("===================\n");

    RegisterTests();

    for (i = 0; i < test_count; ++i)
    {
        printf("Running Suite: %s\n",     test_registry[i].name);
        test_registry[i].func();
    }

    PRINT_SUMMARY();
    
    return 0;
}

static void RegisterTests(void)
{
    REGISTER_TEST(TimePingPongs);
}
