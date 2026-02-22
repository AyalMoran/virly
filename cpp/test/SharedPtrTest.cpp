#include "SharedPtr.hpp"
#include <cstdlib>
#include <cstring>
#include <iostream>

#include "test_utils.hpp"

using namespace ilrd;

class A
{
    public:
        A(int a) : m_a(a) {}
         virtual ~A() { std::cout << "A dtor" << std::endl; }
    private:
        int m_a;
};

class B : public A
{
    public:
        B(int a) : A(a) {}
        virtual ~B() { std::cout << "B dtor" << std::endl; }
};

class C : public B
{
    public:
        C(int a) : B(a) {}
        virtual ~C() { std::cout << "C dtor" << std::endl; }
};

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

    SharedPtr<A> spA(new B(1));

    SharedPtr<A> spA2(spA);
    ASSERT_EQ(TestDiffTypeCCtor, 2, spA2.UseCount());
    ASSERT_EQ(TestDiffTypeCCtor, 2, spA.UseCount());

    SharedPtr<B> spB(new C(2));
    SharedPtr<B> spB2(spB);
    ASSERT_EQ(TestDiffTypeCCtor, 2, spB2.UseCount());
    ASSERT_EQ(TestDiffTypeCCtor, 2, spB.UseCount());

    SharedPtr<A> spA3(new C(3));
    SharedPtr<A> spA4(spA3);
    
    ASSERT_EQ(TestDiffTypeCCtor, 2, spA4.UseCount());
    ASSERT_EQ(TestDiffTypeCCtor, 2, spA3.UseCount());

    END_SUITE(TestDiffTypeCCtor);
}

static void TestDiffTypeOpEqual(void)
{
    INIT_SUITE(TestDiffTypeOpEqual, "TestDiffTypeOpEqual Tests");
    BEGIN_SUITE(TestDiffTypeOpEqual);

    SharedPtr<A> spA(new B(1));
    SharedPtr<A> spA2 = spA;
    SharedPtr<A> spA3 = spA2;
    SharedPtr<A> spA4 = spA3;
    spA = spA4;
    spA = spA3;
    spA = spA2;
    spA = spA;
    ASSERT_EQ(TestDiffTypeOpEqual, 4, spA.UseCount());
    ASSERT_EQ(TestDiffTypeOpEqual, 4, spA2.UseCount());
    ASSERT_EQ(TestDiffTypeOpEqual, 4, spA3.UseCount());
    ASSERT_EQ(TestDiffTypeOpEqual, 4, spA4.UseCount());

   END_SUITE(TestDiffTypeOpEqual);
}

static void TestNullPtr(void)
{
    INIT_SUITE(TestNullPtr, "TestNullPtr Tests");
    BEGIN_SUITE(TestNullPtr);
    SharedPtr<int> sp1;
    ASSERT_EQ(TestNullPtr, 0, sp1.UseCount());
    SharedPtr<int> sp2;
    sp2 = sp1;
    sp1 = sp2;
    sp1 = sp1;
    sp1 = sp2;
    ASSERT_EQ(TestNullPtr, 0, sp2.UseCount());

    SharedPtr<int> sp3(new int(5));
    sp3 = sp1;
    ASSERT_EQ(TestNullPtr, 0, sp3.UseCount());

    SharedPtr<int> sp4(nullptr);
    ASSERT_EQ(TestNullPtr, 0, sp4.UseCount());

    SharedPtr<int> sp5(sp4);
    ASSERT_EQ(TestNullPtr, 0, sp5.UseCount());

    SharedPtr<int> sp6(new int(5));
    sp6 = sp4;
    ASSERT_EQ(TestNullPtr, 0, sp6.UseCount());

    END_SUITE(TestNullPtr);
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
    REGISTER_TEST(TestNullPtr);
}



