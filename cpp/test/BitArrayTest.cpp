/**************************************************************
 * File    : BitArrayTest.cpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

#include <climits>
#include <cstdint>
#include <iostream>
#include <random>

#include "BitArray.hpp"
#include "test_utils.hpp"

static void RegisterTests(void);

/******************************************************
 * START OF ACTUAL TESTS
 ******************************************************/
using namespace ilrd;

class ConstexprRand {
    public:
        explicit constexpr ConstexprRand(unsigned long long seed) : m_seed(seed) {}
    
        constexpr unsigned int operator()() {
            m_seed = (m_seed * 214013L + 2531011L); // LCG formula
            return (m_seed >> 16) & 0x7FFF; // Discard lower bits for better quality
        }
    
    private:
        unsigned long long m_seed;
    };

static void Test_Simple(void)
{
    INIT_SUITE(simple, "SIMPLE");

    BitArray<DEFAULT_BIT_ARR_SIZE> ba;

    // RUN_TEST(simple, "Default constructor returns all bits set to 0",
    // !ba[0]);

    BitArray<DEFAULT_BIT_ARR_SIZE> b1;
    BitArray<DEFAULT_BIT_ARR_SIZE> b2;

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

static std::size_t CountBits(std::uint64_t n)
{
    std::size_t counter = 0;
    while (n)
    {
        n &= n - 1;
        ++counter;
    }

    return counter;
}

template <std::size_t SIZE>
static std::size_t BitArrayToNum(BitArray<SIZE>& bits)
{
    std::size_t num = 0;
    const std::size_t limit = (SIZE < BITS_IN_WORD) ? SIZE : BITS_IN_WORD;
    for (std::size_t i = 0; i < limit; ++i)
    {
        num |= bits[i] << i;
    }
    return num;
}

template <std::size_t SIZE>
static void NumToBitset(std::uint64_t num, BitArray<SIZE>& bits)
{
    bits.Set(false);
    std::size_t i = 0;
    while (num && i < SIZE)
    {
        bits[i] = num & 0x01;
        num >>= 1;
        ++i;
    }
}

static void Test_Phase2()
{

    std::cout << "BITSET SIZE OF " << COMPILE_TIME_RAND << std::endl;
    INIT_SUITE(phase2, "PHASE2");

    BitArray<COMPILE_TIME_RAND> b2;
    
    BitArray<COMPILE_TIME_RAND> b1(true);
    RUN_TEST(phase2, "Ctor with compiled time large bitset works.", b1.Count() == COMPILE_TIME_RAND);
    
    SHOW_SIZET(COMPILE_TIME_RAND);
    SHOW_SIZET(b1.Count());

    std::size_t j = (COMPILE_TIME_RAND > 1) ? (COMPILE_TIME_RAND - 1) : 0;
    std::size_t i = (COMPILE_TIME_RAND > 2) ? (COMPILE_TIME_RAND - 2) : 0;
    std::size_t idx2 = (COMPILE_TIME_RAND > 2) ? 2 : 0;

    b2[j] = true;
    b1[i] = b2[j];
    RUN_TEST(phase2, "b2[j] == true && b1[i] = b2[j] ==> b1[i] == true", b1[i]);

    std::size_t a = 7;
    std::size_t b = 4;
    NumToBitset<COMPILE_TIME_RAND>(a, b1);
    NumToBitset<COMPILE_TIME_RAND>(b, b2);
    bool AllTestsPassed = true;
    for (std::size_t i = std::numeric_limits<std::uint64_t>::max();
         i < std::numeric_limits<std::uint64_t>::max() / 2; ++i)
    {
        a = i;
        NumToBitset<COMPILE_TIME_RAND>(i, b1);
        if (b1.Count() != CountBits(a))
        {
            AllTestsPassed = false;
            break;
        }
    }

    RUN_TEST(phase2, "b1.Count() ==  CountBits(a)", AllTestsPassed);
    SHOW_SIZET(CountBits(a));
    SHOW_SIZET(b1.Count());
    RUN_TEST(phase2, "bits are the same a and b", b2.Count() == CountBits(b));
    std::size_t or_res = a | b;
    b1 |= b2;
    RUN_TEST(phase2, "b1 |= b2", or_res == BitArrayToNum(b1));

    std::size_t and_res = a & b;
    NumToBitset<COMPILE_TIME_RAND>(a, b1);
    b1 &= b2;
    RUN_TEST(phase2, "b1 &= b2;", and_res == BitArrayToNum(b1));

    std::size_t xor_res = a ^ b;

    NumToBitset<COMPILE_TIME_RAND>(a, b1);
    b1 ^= b2;
    RUN_TEST(phase2, "b1 ^= b2", xor_res == BitArrayToNum(b1));

    NumToBitset<COMPILE_TIME_RAND>(UINT_MAX, b1);

    RUN_TEST(phase2, "!b1[i]", !b1[idx2] == false);
    b1[idx2] = false;
    RUN_TEST(phase2, "!b1[i]", !b1[idx2] == true);

    if (b1[i])
    {
        RUN_TEST(phase2, "if(b1[i]) branch works", true);
    }

    NumToBitset<COMPILE_TIME_RAND>(COMPILE_TIME_RAND , b1);
    NumToBitset<COMPILE_TIME_RAND>(COMPILE_TIME_RAND , b2);
    if (b1 == b2)
    {
        RUN_TEST(phase2, "if(b1 == b2) branch works", true);
    }

    NumToBitset<COMPILE_TIME_RAND>(COMPILE_TIME_RAND % 431, b1);
    NumToBitset<COMPILE_TIME_RAND>(COMPILE_TIME_RAND % 432, b2);
    if (b1 != b2)
    {
        RUN_TEST(phase2, "if(b1 != b2) branch works", true);
    }
    /*
     b1 >>= 4; // advanced
     b2 <<= 4; // advanced
    }*/
    
    TestUtils::PrintSuiteSummary(phase2);
}

static void Test_Advanced(void)
{
    INIT_SUITE(advanced, "ADVANCED");
    BitArray<COMPILE_TIME_RAND> b1;
    BitArray<COMPILE_TIME_RAND> b2;
    std::size_t num = COMPILE_TIME_RAND % 431;
    NumToBitset<COMPILE_TIME_RAND>(num, b1);
    SHOW_SIZET(num);
    SHOW_SIZET(BitArrayToNum(b1));
    
    
    num <<= (COMPILE_TIME_RAND % 2);
    b1  <<= ( COMPILE_TIME_RAND % 2);
    
    std::cout << "After Shift: " << std::endl;
    SHOW_SIZET(num);
    SHOW_SIZET(BitArrayToNum(b1));
    RUN_TEST(advanced, "b1 << (COMPILE_TIME_RAND % 34) == num << (COMPILE_TIME_RAND % 34)", BitArrayToNum(b1) == num);
    
    for(size_t i = 0 ; i < COMPILE_TIME_RAND - 1; ++i)
    {
        BitArray<COMPILE_TIME_RAND> c;
        c[0] = true;
        c <<= i;
        RUN_TEST(advanced, " shifting in loop", c[i]); 
        SHOW_SIZET(i);
    }
    
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
    if (TestUtils::GetPassedTests() != TestUtils::GetTotalTests())
    {
        std::cout << "Some tests failed" << std::endl;
        return 1;
    }
    return 0;
}

static void RegisterTests(void)
{
    TestUtils::RegisterTest("Simple", Test_Simple);
    TestUtils::RegisterTest("Phase2", Test_Phase2);
    TestUtils::RegisterTest("Advanced", Test_Advanced);
}
