/******************
 Author  : Ayal Moran
 Reviewer: Daniel N.
 Date    : 17-12-25
 *****************/
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>

#include "SimpleShell.h"
#include "test_utils.h"

static void RegisterTests(void);

/******************************************************
 * START OF ACTUAL TESTS
 ******************************************************/
static void Test_Create(void)
{
    INIT_SUITE(create, "CREATE");

    SimpleShell();

    RUN_TEST(create, "simple shell first test case", 1 == 1);

    printf("== [%s] %d/%d Passed ==\n", create.name,
        create.passed, create.total);
}

int main(void)
{
    int i = 0;
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
