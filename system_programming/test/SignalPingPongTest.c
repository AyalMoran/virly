  /**************************************************************
 * File    : SignalPingPongTest.c
 * Author  : Ayal Moran
 * Reviewer: Oshri F.
 * Date    : 17-12-2025
**************************************************************/
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include <limits.h>

#include "SignalPingPong.h"
#include "test_utils.h"

static void RegisterTests(void);

  /******************************************************
 * START OF ACTUAL TESTS
 ******************************************************/
static void TimePingPongs(void)
{
    SignalPingPong(99999999);
}

int main(void)
{
    RegisterTests();
    test_registry[0].func();
    return 0;
}

static void RegisterTests(void)
{
    REGISTER_TEST(TimePingPongs);
}
