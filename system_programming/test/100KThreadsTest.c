  /**************************************************************
 * File    : $100KThreadsTest.c
 * Author  : Ayal Moran
 * Reviewer: 
 * Date    : 
**************************************************************/
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>

#include "100KThreads.h"
#include "test_utils.h"

static void RegisterTests(void);
  /******************************************************
 * START OF ACTUAL TESTS
 ******************************************************/
static void Test_Create(void)
{
    INIT_SUITE(create, "CREATE");


    printf("== [%s] %d/%d Passed ==\n", create.name,
        create.passed, create.total);
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
    REGISTER_TEST(Test_Create);
}
