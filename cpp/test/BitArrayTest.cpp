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

    BitArray<kDefaultBitArrayBits> ba;

    RUN_TEST(simple, "Default constructor returns all bits set to 0", !ba[0]);

    BitArray<kDefaultBitArrayBits> b1;
    BitArray<kDefaultBitArrayBits> b2;

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

static std::size_t CountBits(int n)
{
    std::size_t counter = 0;
    while (n)
    {
        n &= n - 1;
        ++counter;
    }

    return counter;
}
template <std::size_t SIZE> static std::size_t BitArrayToNum(BitArray<SIZE>& bits)
{
    std::size_t num = 0;
    for (std::size_t i = 0; i < SIZE; ++i)
    {
        num |= bits[i] << i;
    }
    return num;
}

template <std::size_t SIZE> static void NumToBitset(int num, BitArray<SIZE>& bits)
{
    bits.Set(false);
    int i = 0;
    while (num)
    {
        bits[i] = num & 0x01;
        num >>= 1;
        ++i;
    }
}

static void Test_Phase2()
{
    INIT_SUITE(phase2, "PHASE2");

    BitArray<kDefaultBitArrayBits> b1;
    BitArray<kDefaultBitArrayBits> b2;

    int j = 7;
    int i = 4;
    b2[j] = true;
    b1[i] = b2[j];

    RUN_TEST(phase2, "b2[j] == true && b1[i] = b2[j] ==> b1[i] == true", b2[j]);

    int a = 7;
    int b = 4;
    NumToBitset<DEFAULT_BIT_ARR_SIZE>(4, b1);
    NumToBitset<DEFAULT_BIT_ARR_SIZE>(7, b2);

    int or_res = a | b;
    b1 |= b2;
    RUN_TEST(phase2, "b1 |= b2", or_res = BitArrayToNum(b1));

    int and_res = a & b;
    NumToBitset<DEFAULT_BIT_ARR_SIZE>(4, b1);
    b1 &= b2;
    RUN_TEST(phase2, "b1 &= b2;", or_res = BitArrayToNum(b1));

    int xor = a ^ b;

    NumToBitset<DEFAULT_BIT_ARR_SIZE>(4, b1);
    b1 ^= b2;
    RUN_TEST(phase2, "b1 ^= b2", or_res = BitArrayToNum(b1));

    NumToBitset<DEFAULT_BIT_ARR_SIZE>(4, b1);
    !b1[i];
    RUN_TEST(phase2, "!b1[i]", or_res = BitArrayToNum(b1));

    if (b1[i])
    {
        RUN_TEST(phase2, "if(b1[i]) branch works", true);
    }

    NumToBitset<DEFAULT_BIT_ARR_SIZE>(4, b1);
    NumToBitset<DEFAULT_BIT_ARR_SIZE>(4, b2);
    if (b1 == b2)
    {
        RUN_TEST(phase2, "if(b1 == b2) branch works", true);
    }

    NumToBitset<DEFAULT_BIT_ARR_SIZE>(4, b1);
    NumToBitset<DEFAULT_BIT_ARR_SIZE>(5, b2);
    if (b1 != b2)
    {
        RUN_TEST(phase2, "if(b1 != b2) branch works", true);
    }

    b1 >>= 4; // advanced
    b2 <<= 4; // advanced

    TestUtils::PrintSuiteSummary(phase2);
}
int main(void)
{
    int i = 0;

    TestUtils::PrintTestHeader("BitArray");
    std::cout << "===================" << std::endl;

    RegisterTests();

    for (i = 0; i < TestUtils::GetRegisteredTestCount(); ++i)
    {
        std::cout << "Running Suite: " << TestUtils::GetRegisteredTestName(i)
                  << std::endl;
        TestUtils::RunRegisteredTest(i);
    }

    TestUtils::PrintSummary();

    return 0;
}

static void RegisterTests(void)
{
    TestUtils::RegisterTest("Simple", Test_Simple);
    TestUtils::RegisterTest("Phase2", Test_Phase2);
}
