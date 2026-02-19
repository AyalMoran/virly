#include "SharedPtr.hpp"
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <sstream>

#include "test_utils.hpp"

static void RegisterTests(void);

static void TestUseCount(void)
{
     
    INIT_SUITE(TestUseCount, "TestUseCount Tests");
    BEGIN_SUITE(TestUseCount);

    SharedPtr<int> sp1(new int(5));
    ASSERT_EQ(TestUseCount, 1, sp1.UseCount());
    SharedPtr<int> sp2(sp1);
    ASSERT_EQ(TestUseCount, 2, sp2.UseCount());
    SharedPtr<int> sp3(new int(10));
    ASSERT_EQ(TestUseCount, 1, sp3.UseCount());
    sp3 = sp1;
    ASSERT_EQ(TestUseCount, 3, sp3.UseCount());
    ASSERT_EQ(TestUseCount, 3, sp1.UseCount());
    {
        SharedPtr<int> sp4(sp3);
        ASSERT_EQ(TestUseCount, 4, sp4.UseCount());
    }
    ASSERT_EQ(TestUseCount, 3, sp3.UseCount());
    END_SUITE(TestUseCount);
}

static void TestCtor(void)
{
     
    INIT_SUITE(TestCtor, "TestCtor Tests");
    BEGIN_SUITE(TestCtor);

    SharedPtr<int> sp1(new int(5));
    ASSERT_EQ(TestCtor, 1, sp1.UseCount());
    END_SUITE(TestCtor);
}

static void TestDtor(void)
{
    INIT_SUITE(TestDtor, "TestDtor Tests");
    BEGIN_SUITE(TestDtor);
    SharedPtr<int> sp1(new int(5));
    SharedPtr<int> sp2(sp1);
    ASSERT_EQ(TestDtor, 2, sp2.UseCount());
    {
        SharedPtr<int> sp3(sp2);
        ASSERT_EQ(TestDtor, 3, sp3.UseCount());
    }
    ASSERT_EQ(TestDtor, 2, sp2.UseCount());
    END_SUITE(TestDtor);
}

static void TestOpEqual(void)
{
    INIT_SUITE(TestOpEqual, "TestOpEqual Tests");
    BEGIN_SUITE(TestOpEqual);
    SharedPtr<int> sp1(new int(5));
    SharedPtr<int> sp2(sp1);
    std::cout << "sp1: " << sp1.UseCount() << std::endl;
    std::cout << "sp2: " << sp2.UseCount() << std::endl;
    sp2 = sp1;
    sp1=sp2;
    sp1=sp1;
    sp1=sp2;
    sp1=sp1;
    sp1=sp2;
    ASSERT_EQ(TestOpEqual, 2, sp2.UseCount());
    {
        SharedPtr<int> sp3(sp2);
        ASSERT_EQ(TestOpEqual, 3, sp3.UseCount());
    }
    ASSERT_EQ(TestOpEqual, 2, sp2.UseCount());
    END_SUITE(TestOpEqual);
}
static void TestDiffTypeCCtor(void)
{
    INIT_SUITE(TestDiffTypeCCtor, "TestDiffTypeCCtor Tests");
    BEGIN_SUITE(TestDiffTypeCCtor);
    SharedPtr<char> sp1(new char('a'));
    SharedPtr<int> sp2(sp1);
    ASSERT_EQ(TestDiffTypeCCtor, 2, sp2.UseCount());
    END_SUITE(TestDiffTypeCCtor);
}
static void TestDiffTypeOpEqual(void)
{
    INIT_SUITE(TestDiffTypeOpEqual, "TestDiffTypeOpEqual Tests");
    BEGIN_SUITE(TestDiffTypeOpEqual);
    SharedPtr<int> sp1(new int(5));
    SharedPtr<double> sp2(new double(10.0));
    sp2 = sp1;
    ASSERT_EQ(TestDiffTypeOpEqual, 2, sp2.UseCount());
    END_SUITE(TestDiffTypeOpEqual);
}
int main()
{
    PRINT_TEST_HEADER("OVERALL");
    std::cout << "===================\n";
    RegisterTests();

    for (int i = 0; i < TestUtils::GetRegisteredTestCount(); ++i)
    {
        std::cout << "Running Suite: " << TestUtils::GetRegisteredTestName(i) << std::endl;
        TestUtils::RunRegisteredTest(i);
    }

    PRINT_SUMMARY();

    return 0;
}

static void RegisterTests(void)
{
    REGISTER_TEST(TestUseCount);
    REGISTER_TEST(TestCtor);
    REGISTER_TEST(TestDtor);
    REGISTER_TEST(TestOpEqual);
    REGISTER_TEST(TestDiffTypeCCtor);
    REGISTER_TEST(TestDiffTypeOpEqual);
}



