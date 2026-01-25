#include "Complex.hpp"
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <sstream>

#include "test_utils.h"

static void RegisterTests(void);

static void TestCtor(void)
{
    INIT_SUITE(TestCtor, "Constructor Tests");

    // Default constructor (no arguments)
    Complex c1;
    RUN_TEST(TestCtor, "c1.GetReal() == 0", 0 == c1.GetReal());
    RUN_TEST(TestCtor, "c1.GetImg() == 0", 0 == c1.GetImg());

    // Constructor with real only
    Complex c2(5);
    RUN_TEST(TestCtor, "c2.GetReal() == 5", 5 == c2.GetReal());
    RUN_TEST(TestCtor, "c2.GetImg() == 0", 0 == c2.GetImg());

    // Constructor with real and img
    Complex c3(3, 4);
    RUN_TEST(TestCtor, "c3.GetReal() == 3", 3 == c3.GetReal());
    RUN_TEST(TestCtor, "c3.GetImg() == 4", 4 == c3.GetImg());

    // Copy constructor
    Complex c4(c3);
    RUN_TEST(TestCtor, "c4.GetReal() == 3", 3 == c4.GetReal());
    RUN_TEST(TestCtor, "c4.GetImg() == 4", 4 == c4.GetImg());

    // Verify c3 (original) is unchanged
    RUN_TEST(TestCtor, "c3.GetReal() == 3", 3 == c3.GetReal());
    RUN_TEST(TestCtor, "c3.GetImg() == 4", 4 == c3.GetImg());

    END_SUITE(TestCtor);
}

static void TestAssignment(void)
{
    INIT_SUITE(TestAssignment, "Assignment Operator Tests");

    Complex c1(1, 2);
    Complex c2(3, 4);

    // Assignment operator (c1 = c2)
    c1 = c2;
    RUN_TEST(TestAssignment, "c1.GetReal() == 3", 3 == c1.GetReal());
    RUN_TEST(TestAssignment, "c1.GetImg() == 4", 4 == c1.GetImg());

    // Verify c2 (original) is unchanged
    RUN_TEST(TestAssignment, "c2.GetReal() == 3", 3 == c2.GetReal());
    RUN_TEST(TestAssignment, "c2.GetImg() == 4", 4 == c2.GetImg());

    // Self-assignment (c1 = c1)
    c1 = c1;
    RUN_TEST(TestAssignment, "c1.GetReal() == 3", 3 == c1.GetReal());
    RUN_TEST(TestAssignment, "c1.GetImg() == 4", 4 == c1.GetImg());

    END_SUITE(TestAssignment);
}

static void TestPlusMinus(void)
{
    INIT_SUITE(TestPlusMinus, "Plus Minus Tests");

    Complex c1(1, 2);
    Complex c2(3, 4);

    // Binary operator+
    Complex c3 = c1 + c2;
    RUN_TEST(TestPlusMinus, "c3.GetReal() == 4", 4 == c3.GetReal());
    RUN_TEST(TestPlusMinus, "c3.GetImg() == 6", 6 == c3.GetImg());

    // Binary operator-
    Complex c4 = c1 - c2;
    RUN_TEST(TestPlusMinus, "c4.GetReal() == -2", -2 == c4.GetReal());
    RUN_TEST(TestPlusMinus, "c4.GetImg() == -2", -2 == c4.GetImg());

    // Compound operator+=
    Complex c5(5, 6);
    c5 += c1;
    RUN_TEST(TestPlusMinus, "c5.GetReal() == 6", 6 == c5.GetReal());
    RUN_TEST(TestPlusMinus, "c5.GetImg() == 8", 8 == c5.GetImg());

    // Compound operator-=
    c5 -= c2;
    RUN_TEST(TestPlusMinus, "c5.GetReal() == 3", 3 == c5.GetReal());
    RUN_TEST(TestPlusMinus, "c5.GetImg() == 4", 4 == c5.GetImg());

    END_SUITE(TestPlusMinus);
}

static void TestMultiplyDivide(void)
{
    INIT_SUITE(TestMultiplyDivide, "Multiply Divide Tests");

    Complex c1(1, 2);
    Complex c2(3, 4);

    // Binary operator*: (1+2i) * (3+4i) = (1*3 - 2*4) + (1*4 + 2*3)i = -5 + 10i
    Complex c3 = c1 * c2;
    RUN_TEST(TestMultiplyDivide, "c3.GetReal() == -5", -5 == c3.GetReal());
    RUN_TEST(TestMultiplyDivide, "c3.GetImg() == 10", 10 == c3.GetImg());

    // Binary operator/: (1+2i) / (3+4i) = (1*3 + 2*4)/(3^2+4^2) + (2*3 -
    // 1*4)/(3^2+4^2)i = (3+8)/25 + (6-4)/25*i = 11/25 + 2/25*i = 0.44 + 0.08i
    Complex c4 = c1 / c2;
    RUN_TEST(TestMultiplyDivide, "c4.GetReal() == 0.44f",
             0.44f == c4.GetReal());
    RUN_TEST(TestMultiplyDivide, "c4.GetImg() == 0.08f", 0.08f == c4.GetImg());

    // Compound operator*=
    Complex c5(2, 3);
    c5 *= c1; // (2+3i) * (1+2i) = (2*1 - 3*2) + (2*2 + 3*1)i = -4 + 7i
    RUN_TEST(TestMultiplyDivide, "c5.GetReal() == -4", -4 == c5.GetReal());
    RUN_TEST(TestMultiplyDivide, "c5.GetImg() == 7", 7 == c5.GetImg());

    // Compound operator/=
    Complex c6(5, 10);
    Complex c7(1, 2);
    c6 /= c7; // (5+10i) / (1+2i) = 5(1+2i) / (1+2i) = 5
    RUN_TEST(TestMultiplyDivide, "c6.GetReal() == 5", 5 == c6.GetReal());
    RUN_TEST(TestMultiplyDivide, "c6.GetImg() == 0", 0 == c6.GetImg());

    // test division by zero
    Complex c8(0, 0);
    Complex c9(1, 2);
    try
    {
        c9 /= c8;
    }
    catch (const std::runtime_error& e)
    {
        RUN_TEST(TestMultiplyDivide, std::string(e.what()).c_str(), true);
    }

    END_SUITE(TestMultiplyDivide);
}

static void TestComparison(void)
{
    INIT_SUITE(TestComparison, "Comparison Operator Tests");

    Complex c1(1, 2);
    Complex c2(1, 2);
    Complex c3(3, 4);
    Complex c4(1, 3);
    Complex c5(2, 2);

    // operator==
    RUN_TEST(TestComparison, "c1 == c2", true == (c1 == c2));
    RUN_TEST(TestComparison, "c1 == c3", false == (c1 == c3));
    RUN_TEST(TestComparison, "c1 == c4", false == (c1 == c4));
    RUN_TEST(TestComparison, "c1 == c5", false == (c1 == c5));

    // operator!=
    RUN_TEST(TestComparison, "c1 != c2", false == (c1 != c2));
    RUN_TEST(TestComparison, "c1 != c3", true == (c1 != c3));
    RUN_TEST(TestComparison, "c1 != c4", true == (c1 != c4));
    RUN_TEST(TestComparison, "c1 != c5", true == (c1 != c5));

    // Test with zero
    Complex c6(0, 0);
    Complex c7;
    RUN_TEST(TestComparison, "c6 == c7", true == (c6 == c7));

    END_SUITE(TestComparison);
}

static void TestStreamOperator(void)
{
    INIT_SUITE(TestStreamOperator, "Stream Operator Tests");

    Complex c1(3, 4);
    Complex c2(-1, -2);
    Complex c3(0, 5);
    Complex c4(7, 0);

    std::ostringstream oss1, oss2, oss3, oss4;
    oss1 << c1;
    oss2 << c2;
    oss3 << c3;
    oss4 << c4;

    RUN_TEST(TestStreamOperator, "oss1.str() is not empty",
             !oss1.str().empty());
    RUN_TEST(TestStreamOperator, "oss2.str() is not empty",
             !oss2.str().empty());
    RUN_TEST(TestStreamOperator, "oss3.str() is not empty",
             !oss3.str().empty());
    RUN_TEST(TestStreamOperator, "oss4.str() is not empty",
             !oss4.str().empty());

    std::cout << oss1.str() << std::endl;
    std::cout << oss2.str() << std::endl;
    std::cout << oss3.str() << std::endl;
    std::cout << oss4.str() << std::endl;

    RUN_TEST(TestStreamOperator, "oss1.str() == \"{3 + 4i}\"",
             0 == strcmp("{3 + 4i}", oss1.str().c_str()));
    RUN_TEST(TestStreamOperator, "oss2.str() == \"{-1 - 2i}\"",
             0 == strcmp("{-1 - 2i}", oss2.str().c_str()));
    RUN_TEST(TestStreamOperator, "oss3.str() == \"{0 + 5i}\"",
             0 == strcmp("{0 + 5i}", oss3.str().c_str()));
    RUN_TEST(TestStreamOperator, "oss4.str() == \"{7 + 0i}\"",
             0 == strcmp("{7 + 0i}", oss4.str().c_str()));

    std::cout << "Enter a complex number: ";
    Complex c5(1);
    std::cin >> c5;
    std::cout << "c5: " << c5 << std::endl;
    END_SUITE(TestStreamOperator);
}

static void TestLoad(void)
{
    INIT_SUITE(TestLoad, "Load Test");

    std::size_t i = 0;
    const std::size_t num_iterations = 999999999UL;
    Complex c1(1.0f, 2.0f);
    Complex c2 = c1 + c1;

    for (i = 0; i < num_iterations; ++i)
    {
        c1 = c1 + c2;
        c2 = c2 + c1;
    }

    std::cout << "Completed " << c2 << c1;
    END_SUITE(TestLoad);
}

int main()
{
    int i = 0;
    PRINT_TEST_HEADER("OVERALL");
    std::cout << "===================\n";

    RegisterTests();

    for (i = 0; i < test_count; ++i)
    {
        std::cout << "Running Suite: " << test_registry[i].name << std::endl;
        test_registry[i].func();
    }

    PRINT_SUMMARY();

    return 0;
}

static void RegisterTests(void)
{
    // REGISTER_TEST(TestCtor);
    // REGISTER_TEST(TestAssignment);
    // REGISTER_TEST(TestPlusMinus);
    // REGISTER_TEST(TestMultiplyDivide);
    // REGISTER_TEST(TestComparison);
    // REGISTER_TEST(TestStreamOperator);
    REGISTER_TEST(TestLoad);
}