/**************************************************************
 * File    : BitArrayTest.cpp
 * Author  : Ayal Moran
 * Reviewer: 
 * Date    : 
**************************************************************/

#include <iostream>

#include "BitArray.hpp"
#include "test_utils.hpp"

static void RegisterTests(void);

/******************************************************
 * START OF ACTUAL TESTS
 ******************************************************/
static void Test_Create(void)
{
    INIT_SUITE(create, "CREATE");

    data_structure_t *ds = DSCreate();

    RUN_TEST(create, "Create returns non-NULL", ds != NULL);

    DSDestroy(ds);

   std::cout << "== " <<  create.name << create.passed << "/" << create.total << " Passed ==" << std::endl;
}

int main(void)
{
    int i=0;
    
    PRINT_TEST_HEADER("BitArray");
    printf("===================\n");

    RegisterTests();

    for (i = 0; i < test_count; ++i)
    {
        std::cout << "Running Suite: "  <<  test_registry[i].name << std:endl;
        test_registry[i].func();
    }

    PRINT_SUMMARY();
    
    return 0;
}

static void RegisterTests(void)
{
    REGISTER_TEST(Test_Create);
}
