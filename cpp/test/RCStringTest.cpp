/*************************************
 * RCStringTest.cpp
 * Author: Ayal Moran
 * Reviewer: Yehuda F
 * Date: 27-01-2026
 */
#include <cassert>
#include <cstring>
#include <iostream>
#include <sstream>

#include "RCString.hpp"
#include "test_utils.h"

using namespace std;
using namespace ilrd;

static void RegisterTests(void);

static void TestConstructor(void)
{
    INIT_SUITE(TestConstructor, "Constructor Tests");

    RCString s1;
    RUN_TEST(TestConstructor, "s1.Length() == 0", s1.Length() == 0);
    RUN_TEST(TestConstructor, "strcmp(s1.ToCStr(), \"\") == 0",
             strcmp(s1.ToCStr(), "") == 0);

    RCString s2("hello");
    RUN_TEST(TestConstructor, "s2.Length() == 5", s2.Length() == 5);
    RUN_TEST(TestConstructor, "strcmp(s2.ToCStr(), \"hello\") == 0",
             strcmp(s2.ToCStr(), "hello") == 0);

    RCString s3("");
    RUN_TEST(TestConstructor, "s3.Length() == 0", s3.Length() == 0);

    END_SUITE(TestConstructor);
}

static void TestCopyConstructor(void)
{
    INIT_SUITE(TestCopyConstructor, "Copy Constructor Tests");

    RCString s1("test");
    RCString s2(s1);

    RUN_TEST(TestCopyConstructor, "s1.ToCStr() == s2.ToCStr()",
             s1.ToCStr() == s2.ToCStr());
    RUN_TEST(TestCopyConstructor, "s1.Length() == s2.Length()",
             s1.Length() == s2.Length());
    RUN_TEST(TestCopyConstructor, "strcmp(s1.ToCStr(), \"test\") == 0",
             strcmp(s1.ToCStr(), "test") == 0);

    RCString s3(s2);
    RCString s4(s3);
    RUN_TEST(TestCopyConstructor, "s1.ToCStr() == s4.ToCStr()",
             s1.ToCStr() == s4.ToCStr());

    END_SUITE(TestCopyConstructor);
}

static void TestAssignment(void)
{
    INIT_SUITE(TestAssignment, "Assignment Operator Tests");

    RCString s1("first");
    RCString s2("second");

    s2 = s1;
    RUN_TEST(TestAssignment, "strcmp(s2.ToCStr(), \"first\") == 0",
             strcmp(s2.ToCStr(), "first") == 0);
    RUN_TEST(TestAssignment, "s1.ToCStr() == s2.ToCStr()",
             s1.ToCStr() == s2.ToCStr());

    s1 = s1;
    RUN_TEST(TestAssignment, "strcmp(s1.ToCStr(), \"first\") == 0",
             strcmp(s1.ToCStr(), "first") == 0);

    RCString s3("third");
    s3 = s2 = s1;
    RUN_TEST(TestAssignment, "strcmp(s3.ToCStr(), \"first\") == 0",
             strcmp(s3.ToCStr(), "first") == 0);

    END_SUITE(TestAssignment);
}

static void TestConstIndexOperator(void)
{
    INIT_SUITE(TestConstIndexOperator, "Const Index Operator Tests");

    RCString s("hello");

    RUN_TEST(TestConstIndexOperator, "s[0] == 'h'", s[0] == 'h');
    RUN_TEST(TestConstIndexOperator, "s[1] == 'e'", s[1] == 'e');
    RUN_TEST(TestConstIndexOperator, "s[2] == 'l'", s[2] == 'l');
    RUN_TEST(TestConstIndexOperator, "s[3] == 'l'", s[3] == 'l');
    RUN_TEST(TestConstIndexOperator, "s[4] == 'o'", s[4] == 'o');

    const RCString& cs = s;
    RUN_TEST(TestConstIndexOperator, "cs[0] == 'h'", cs[0] == 'h');

    END_SUITE(TestConstIndexOperator);
}

static void TestNonConstIndexOperator(void)
{
    INIT_SUITE(TestNonConstIndexOperator, "Non-Const Index Operator Tests");

    RCString s1("abc");
    RCString s2(s1);

    s2[0] = 'x';

    RUN_TEST(TestNonConstIndexOperator, "s1.ToCStr() != s2.ToCStr()",
             s1.ToCStr() != s2.ToCStr());
    RUN_TEST(TestNonConstIndexOperator, "strcmp(s1.ToCStr(), \"abc\") == 0",
             strcmp(s1.ToCStr(), "abc") == 0);
    RUN_TEST(TestNonConstIndexOperator, "strcmp(s2.ToCStr(), \"xbc\") == 0",
             strcmp(s2.ToCStr(), "xbc") == 0);

    char c = s2[1];
    RUN_TEST(TestNonConstIndexOperator, "c == 'b'", c == 'b');

    s2[1] = 'y';
    s2[2] = 'z';
    RUN_TEST(TestNonConstIndexOperator, "strcmp(s2.ToCStr(), \"xyz\") == 0",
             strcmp(s2.ToCStr(), "xyz") == 0);

    END_SUITE(TestNonConstIndexOperator);
}

static void TestCopyOnWrite(void)
{
    INIT_SUITE(TestCopyOnWrite, "Copy-On-Write Tests");

    RCString s1("original");
    RCString s2(s1);
    RCString s3(s2);

    RUN_TEST(TestCopyOnWrite, "s1.ToCStr() == s2.ToCStr()",
             s1.ToCStr() == s2.ToCStr());
    RUN_TEST(TestCopyOnWrite, "s2.ToCStr() == s3.ToCStr()",
             s2.ToCStr() == s3.ToCStr());

    s3[0] = 'O';

    RUN_TEST(TestCopyOnWrite, "s1.ToCStr() != s3.ToCStr()",
             s1.ToCStr() != s3.ToCStr());
    RUN_TEST(TestCopyOnWrite, "s2.ToCStr() != s3.ToCStr()",
             s2.ToCStr() != s3.ToCStr());
    RUN_TEST(TestCopyOnWrite, "s1.ToCStr() == s2.ToCStr()",
             s1.ToCStr() == s2.ToCStr());
    RUN_TEST(TestCopyOnWrite, "strcmp(s1.ToCStr(), \"original\") == 0",
             strcmp(s1.ToCStr(), "original") == 0);
    RUN_TEST(TestCopyOnWrite, "strcmp(s3.ToCStr(), \"Original\") == 0",
             strcmp(s3.ToCStr(), "Original") == 0);

    END_SUITE(TestCopyOnWrite);
}

static void TestComparisonOperators(void)
{
    INIT_SUITE(TestComparisonOperators, "Comparison Operator Tests");

    RCString s1("abc");
    RCString s2("abc");
    RCString s3("def");
    RCString s4("ab");

    RUN_TEST(TestComparisonOperators, "s1 == s2", s1 == s2);
    RUN_TEST(TestComparisonOperators, "!(s1 == s3)", !(s1 == s3));
    RUN_TEST(TestComparisonOperators, "!(s1 == s4)", !(s1 == s4));

    RUN_TEST(TestComparisonOperators, "!(s1 != s2)", !(s1 != s2));
    RUN_TEST(TestComparisonOperators, "s1 != s3", s1 != s3);
    RUN_TEST(TestComparisonOperators, "s1 != s4", s1 != s4);

    RUN_TEST(TestComparisonOperators, "s1 < s3", s1 < s3);
    RUN_TEST(TestComparisonOperators, "s4 < s1", s4 < s1);
    RUN_TEST(TestComparisonOperators, "!(s1 < s2)", !(s1 < s2));
    RUN_TEST(TestComparisonOperators, "!(s3 < s1)", !(s3 < s1));

    RUN_TEST(TestComparisonOperators, "s3 > s1", s3 > s1);
    RUN_TEST(TestComparisonOperators, "s1 > s4", s1 > s4);
    RUN_TEST(TestComparisonOperators, "!(s1 > s2)", !(s1 > s2));
    RUN_TEST(TestComparisonOperators, "!(s1 > s3)", !(s1 > s3));

    RUN_TEST(TestComparisonOperators, "\"abc\" == s1", "abc" == s1);
    RUN_TEST(TestComparisonOperators, "\"def\" != s1", "def" != s1);
    RUN_TEST(TestComparisonOperators, "\"ab\" < s1", "ab" < s1);
    RUN_TEST(TestComparisonOperators, "\"def\" > s1", "def" > s1);

    END_SUITE(TestComparisonOperators);
}
static bool CheckString(const RCString& str)
{
    return str.Length() > 0;
}
static void TestImplicitConversion(void)
{
    INIT_SUITE(TestImplicitConversion, "Implicit Conversion Tests");

    RCString s1 = "implicit";
    RUN_TEST(TestImplicitConversion, "strcmp(s1.ToCStr(), \"implicit\") == 0",
             strcmp(s1.ToCStr(), "implicit") == 0);

    RUN_TEST(TestImplicitConversion, "CheckString(\"test\")",
             CheckString("test"));

    END_SUITE(TestImplicitConversion);
}

static void TestStreamOperator(void)
{
    INIT_SUITE(TestStreamOperator, "Stream Operator Tests");

    RCString s1("hello");
    RCString s2("world");

    std::ostringstream oss1, oss2;
    oss1 << s1;
    oss2 << s2;

    RUN_TEST(TestStreamOperator, "oss1.str() == \"hello\"",
             oss1.str() == "hello");
    RUN_TEST(TestStreamOperator, "oss2.str() == \"world\"",
             oss2.str() == "world");
    cout << "oss1: " << oss1.str() << ", oss2: " << oss2.str() << endl;
    END_SUITE(TestStreamOperator);
}

static void TestLengthAndToCStr(void)
{
    INIT_SUITE(TestLengthAndToCStr, "Length and ToCStr Tests");

    RCString s1("hello");
    RUN_TEST(TestLengthAndToCStr, "s1.Length() == 5", s1.Length() == 5);
    RUN_TEST(TestLengthAndToCStr, "strcmp(s1.ToCStr(), \"hello\") == 0",
             strcmp(s1.ToCStr(), "hello") == 0);

    RCString s2("");
    RUN_TEST(TestLengthAndToCStr, "s2.Length() == 0", s2.Length() == 0);
    RUN_TEST(TestLengthAndToCStr, "strcmp(s2.ToCStr(), \"\") == 0",
             strcmp(s2.ToCStr(), "") == 0);

    RCString s3("a");
    RUN_TEST(TestLengthAndToCStr, "s3.Length() == 1", s3.Length() == 1);

    END_SUITE(TestLengthAndToCStr);
}

static void TestReferenceCounting(void)
{
    INIT_SUITE(TestReferenceCounting, "Reference Counting Tests");

    RCString s1("shared");
    RCString s2(s1);
    RCString s3(s2);

    RUN_TEST(TestReferenceCounting, "s1.ToCStr() == s2.ToCStr()",
             s1.ToCStr() == s2.ToCStr());
    RUN_TEST(TestReferenceCounting, "s2.ToCStr() == s3.ToCStr()",
             s2.ToCStr() == s3.ToCStr());

    RCString s4;
    s4 = s1;
    RUN_TEST(TestReferenceCounting, "s1.ToCStr() == s4.ToCStr()",
             s1.ToCStr() == s4.ToCStr());

    s4[0] = 'S';
    RUN_TEST(TestReferenceCounting, "s1.ToCStr() != s4.ToCStr()",
             s1.ToCStr() != s4.ToCStr());
    RUN_TEST(TestReferenceCounting, "strcmp(s1.ToCStr(), \"shared\") == 0",
             strcmp(s1.ToCStr(), "shared") == 0);

    END_SUITE(TestReferenceCounting);
}

int main()
{
    PRINT_TEST_HEADER("RCString");
    std::cout << "===================\n";
    RegisterTests();

    for (int i = 0; i < test_count; ++i)
    {
        std::cout << "Running Suite: " << test_registry[i].name << std::endl;
        test_registry[i].func();
    }

    PRINT_SUMMARY();

    return 0;
}

static void RegisterTests(void)
{
    REGISTER_TEST(TestConstructor);
    REGISTER_TEST(TestCopyConstructor);
    REGISTER_TEST(TestAssignment);
    REGISTER_TEST(TestConstIndexOperator);
    REGISTER_TEST(TestNonConstIndexOperator);
    REGISTER_TEST(TestCopyOnWrite);
    REGISTER_TEST(TestComparisonOperators);
    REGISTER_TEST(TestImplicitConversion);
    REGISTER_TEST(TestStreamOperator);
    REGISTER_TEST(TestLengthAndToCStr);
    REGISTER_TEST(TestReferenceCounting);
}