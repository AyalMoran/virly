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
using namespace ilrd;

static void Test_Simple(void)
{
    INIT_SUITE(simple, "SIMPLE");

    BitArray ba;

    RUN_TEST(simple, "Default constructor returns all bits set to 0", !ba[0]);

    BitArray b1;
    BitArray b2;

    b2[5] = true;
    RUN_TEST(simple, "Set bit 5 to true", b2[5]);

    b1[5] = b2[5];
    RUN_TEST(simple, "Copy single bit from b2 to b1", b1[5]);
    
    if (b1[5])
    {
        RUN_TEST(simple, "if (b1[5]) is true", true);
    }

    b1[5] = false;
    RUN_TEST(simple, "b1[5] = false", false == b1[5]);

   TestUtils::PrintSuiteSummary(simple);
}

int main(void)
{
    int i=0;
    
    TestUtils::PrintTestHeader("BitArray");
    std::cout << "===================" << std::endl;

    RegisterTests();

    for (i = 0; i < TestUtils::GetRegisteredTestCount(); ++i)
    {
        std::cout << "Running Suite: "  <<  TestUtils::GetRegisteredTestName(i) << std::endl;
        TestUtils::RunRegisteredTest(i);
    }

    TestUtils::PrintSummary();
    
    return 0;
}

static void RegisterTests(void)
{
    TestUtils::RegisterTest("Simple", Test_Simple);
}
