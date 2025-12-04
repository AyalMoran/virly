/**************************************************************
 *  File        : avl.c
 *  Author      : Ayal Moran
 *  Reviewer    : Yohai Shohet
 *  Date        : 01-12-2025
 **************************************************************/
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "avl.h"
#include "bst.h"

#pragma region testing utils
/* structs and globals */
#define MAX_TESTS 30

typedef struct
{
    const char* name;
    int total;
    int passed;
} test_suite_t;

typedef void (*test_func_t)(void);

typedef struct
{
    const char* name;
    test_func_t func;
} named_test_t;

int total_tests = 0;
int passed_tests = 0;
static named_test_t test_registry[MAX_TESTS];
static size_t test_count = 0;

/*output and colors*/
/* General Formatting */
#define RESET (0)
#define BRIGHT (1)
#define DIM (2)
#define UNDERSCORE (3)
#define BLINK (4)
#define REVERSE (5)
#define HIDDEN (6)

/* Foreground Colors */
#define FG_BLACK (30)
#define FG_RED (31)
#define FG_GREEN (32)
#define FG_YELLOW (33)
#define FG_BLUE (34)
#define FG_MAGENTA (35)
#define FG_CYAN (36)
#define FG_WHITE (37)

/* Background Colors */
#define BG_BLACK (40)
#define BG_RED (41)
#define BG_GREEN (42)
#define BG_YELLOW (43)
#define BG_BLUE (44)
#define BG_MAGENTA (45)
#define BG_CYAN (46)
#define BG_WHITE (47)

#define SET_PRINT_COLOR(X) printf("\x1b[%dm", X)

#define PRINT_TEST_HEADER(name)                                                \
    do                                                                         \
    {                                                                          \
        SET_PRINT_COLOR(BRIGHT);                                               \
        SET_PRINT_COLOR(FG_BLUE);                                              \
        SET_PRINT_COLOR(BG_YELLOW);                                            \
        printf("=====STARTING %s TESTS=====", name);                           \
        printf("===================\n");                                       \
        SET_PRINT_COLOR(RESET);                                                \
        printf("\n");                                                          \
    } while (0)

/* value prints and debugging */
#define TRACE() printf("[TRACE] %s:%d\n", __FILE__, __LINE__)
#define SHOW_INT(x) printf("Value of " #x " is %d\n", x)
#define SHOW_CHAR(x) printf("Value of " #x " is %c\n", x)
#define SHOW_SIZE(x) printf("Size of " #x " is %lu\n", sizeof(x))
#define SHOW_SIZET(x) printf("Value of " #x " is %lu\n", x)
#define SHOW_PTR(x) printf("Value of " #x " is %p\n", (void*) x)
#define SHOW_STR(x) printf("Value of " #x " is %s\n", x)
#define SHOW_FLOAT(x) printf("Value of " #x " is %f\n", x)
#define SHOW_DOUBLE(x) printf("Value of " #x " is %lf\n", x)
#define SHOW_LONG(x) printf("Value of " #x " is %ld\n", x)
#define SHOW_ULONG(x) printf("Value of " #x " is %lu\n", x)

/* assertions */
#define ASSERT_TRUE(suite, expr) RUN_TEST(suite, #expr, (expr))

#define ASSERT_FALSE(suite, expr) RUN_TEST(suite, #expr, !(expr))

#define ASSERT_EQ(suite, expected, actual)                                     \
    RUN_TEST(suite, #expected " == " #actual, (expected) == (actual))

#define ASSERT_NEQ(suite, expected, actual)                                    \
    RUN_TEST(suite, #expected " != " #actual, (expected) != (actual))

#define ASSERT_NULL(suite, ptr) RUN_TEST(suite, #ptr " == NULL", (ptr) == NULL)

#define ASSERT_NOT_NULL(suite, ptr)                                            \
    RUN_TEST(suite, #ptr " != NULL", (ptr) != NULL)

#define ASSERT_STR_EQ(suite, expected, actual)                                 \
    RUN_TEST(suite, #expected " == " #actual, strcmp((expected), (actual)) == 0)

#define ASSERT_MEM_EQ(suite, ptr1, ptr2, size)                                 \
    RUN_TEST(suite, "memcmp(" #ptr1 ", " #ptr2 ", " #size ") == 0",            \
             memcmp(ptr1, ptr2, size) == 0)

/*test suites*/

#define TEST_CASE(name)                                                        \
    do                                                                         \
    {                                                                          \
        printf("\n--- Running Test: %s ---\n", name);                          \
    } while (0)

#define BEGIN_SUITE(name)                                                      \
    do                                                                         \
    {                                                                          \
        SET_PRINT_COLOR(BRIGHT);                                               \
        SET_PRINT_COLOR(FG_BLUE);                                              \
        printf("\n========== BEGIN SUITE: %s ==========\n\n", name);           \
        SET_PRINT_COLOR(RESET);                                                \
    } while (0)

#define END_SUITE(name)                                                        \
    do                                                                         \
    {                                                                          \
        SET_PRINT_COLOR(BRIGHT);                                               \
        SET_PRINT_COLOR(FG_BLUE);                                              \
        printf("\n========== END SUITE: %s ==========\n\n", name);             \
        SET_PRINT_COLOR(RESET);                                                \
    } while (0)

#define INIT_SUITE(suite, suite_name) test_suite_t suite = {suite_name, 0, 0}

#define RUN_TEST(suite, desc, expr)                                            \
    do                                                                         \
    {                                                                          \
        ++suite.total;                                                         \
        ++total_tests;                                                         \
        if (expr)                                                              \
        {                                                                      \
            ++suite.passed;                                                    \
            ++passed_tests;                                                    \
            SET_PRINT_COLOR(FG_GREEN);                                         \
            SET_PRINT_COLOR(BRIGHT);                                           \
            printf("[PASS] %s [line %d]\n", desc, __LINE__);                   \
        }                                                                      \
        else                                                                   \
        {                                                                      \
            SET_PRINT_COLOR(FG_RED);                                           \
            SET_PRINT_COLOR(BRIGHT);                                           \
            printf("[FAIL] %s [line %d]\n", desc, __LINE__);                   \
        }                                                                      \
        SET_PRINT_COLOR(RESET);                                                \
    } while (0)

#define PRINT_SUITE_SUMMARY(suite)                                             \
    printf("== [%s] %d/%d Passed ==\n", suite.name, suite.passed, suite.total)

#define REGISTER_TEST(funct)                                                   \
    do                                                                         \
    {                                                                          \
        if (test_count < MAX_TESTS)                                            \
        {                                                                      \
            test_registry[test_count].name = #funct;                           \
            test_registry[test_count].func = funct;                            \
            ++test_count;                                                      \
        }                                                                      \
        else                                                                   \
        {                                                                      \
            fprintf(stderr, "[ERROR] Max test limit reached\n");               \
            exit(1);                                                           \
        }                                                                      \
    } while (0)

#define PRINT_SUMMARY()                                                        \
    do                                                                         \
    {                                                                          \
        SET_PRINT_COLOR(BRIGHT);                                               \
        if (passed_tests == total_tests)                                       \
        {                                                                      \
            SET_PRINT_COLOR(FG_GREEN);                                         \
            printf("=== All tests passed (%d/%d) ===\n", passed_tests,         \
                   total_tests);                                               \
        }                                                                      \
        else                                                                   \
        {                                                                      \
            SET_PRINT_COLOR(FG_YELLOW);                                        \
            printf("=== Partial success (%d/%d) ===\n", passed_tests,          \
                   total_tests);                                               \
        }                                                                      \
        SET_PRINT_COLOR(RESET);                                                \
    } while (0)

#pragma endregion

/******************************************************
 * START OF ACTUAL TESTS
 ******************************************************/

static void RegisterTests(void);

/* callbacks*/
void PrintInt(const void* data)
{
    printf("%d", *(const int*) data);
}

int PlusOne(void* data, void* param)
{
    static int num = 9;
    *(int*) data += 1;

    ++num;
    (void) param;

    return 0;
}

int Double(void* data, void* param)
{
    *(int*) data *= 2;

    (void) param;

    return 0;
}

int MakeAll420(void* data, void* param)
{
    *(int*) data = 420;
    (void) param;

    return 0;
}

int MakeAscending(void* data, void* param)
{
    static int num = 1;
    *(int*) data = num;
    ++num;
    (void) param;

    return 0;
}
/*cmp functions*/
static size_t cmp_count = 0;

int IntCmp(const void* a, const void* b)
{
    ++cmp_count;
    return (*(int*) a > *(int*) b) - (*(int*) a < *(int*) b);
}

static void Test_Create(void)
{
    INIT_SUITE(create, "CREATE");

    avl_t* tree = AVLCreate(IntCmp);

    RUN_TEST(create, "Create returns non-NULL", tree != NULL);

    AVLDestroy(tree);

    printf("== [%s] %d/%d Passed ==\n", create.name, create.passed,
           create.total);
}
static void Test_Insert(void)
{

    int a = 1, b = 2, c = 3, d = 4, e = 5;

    avl_t* tree = AVLCreate(IntCmp);

    INIT_SUITE(insert, "INSERT");

    AVLInsert(tree, &a);
    AVLInsert(tree, &b);
    AVLInsert(tree, &c);
    AVLInsert(tree, &d);
    AVLInsert(tree, &e);

    RUN_TEST(insert, "Size after five insertions is 5: ", AVLSize(tree) == 5);
#ifndef NDEBUG
    AVLPrint(tree, PrintInt);
#endif /*NDEBUG*/
    AVLDestroy(tree);

    printf("== [%s] %d/%d Passed ==\n", insert.name, insert.passed,
           insert.total);
}

static void Test_Remove(void)
{
    INIT_SUITE(remove, "REMOVE");

    {
        int a = 1;
        avl_t* tree = AVLCreate(IntCmp);
        AVLInsert(tree, &a);

        TEST_CASE("Remove only node");
        AVLRemove(tree, &a);
        ASSERT_TRUE(remove, AVLIsEmpty(tree));
        ASSERT_EQ(remove, 0, AVLSize(tree));
        AVLDestroy(tree);
    }

    {
        int a = 1, b = 2, c = 3;
        avl_t* tree = AVLCreate(IntCmp);
        AVLInsert(tree, &b);
        AVLInsert(tree, &a);
        AVLInsert(tree, &c);

        TEST_CASE("Remove leaf node (c)");
        AVLRemove(tree, &c);
        ASSERT_EQ(remove, 2, AVLSize(tree));
        ASSERT_NULL(remove, AVLFind(tree, &c));
        ASSERT_NOT_NULL(remove, AVLFind(tree, &a));
        ASSERT_NOT_NULL(remove, AVLFind(tree, &b));
        AVLDestroy(tree);
    }

    {
        int a = 1, b = 2, c = 3;
        avl_t* tree = AVLCreate(IntCmp);
        AVLInsert(tree, &c);
        AVLInsert(tree, &b);
        AVLInsert(tree, &a);

        TEST_CASE("Remove node with one left child (b)");
        AVLRemove(tree, &b);
        ASSERT_EQ(remove, 2, AVLSize(tree));
        ASSERT_NULL(remove, AVLFind(tree, &b));
        ASSERT_NOT_NULL(remove, AVLFind(tree, &a));
        ASSERT_NOT_NULL(remove, AVLFind(tree, &c));
        AVLDestroy(tree);
    }

    {
        int a = 1, b = 2, c = 3;
        avl_t* tree = AVLCreate(IntCmp);
        AVLInsert(tree, &a);
        AVLInsert(tree, &b);
        AVLInsert(tree, &c);

        TEST_CASE("Remove node with one right child (b)");
        AVLRemove(tree, &b);
        ASSERT_EQ(remove, 2, AVLSize(tree));
        ASSERT_NULL(remove, AVLFind(tree, &b));
        ASSERT_NOT_NULL(remove, AVLFind(tree, &a));
        ASSERT_NOT_NULL(remove, AVLFind(tree, &c));
        AVLDestroy(tree);
    }

    {
        int a = 1, b = 2, c = 3, d = 4, e = 5;
        avl_t* tree = AVLCreate(IntCmp);
        AVLInsert(tree, &c);
        AVLInsert(tree, &a);
        AVLInsert(tree, &e);
        AVLInsert(tree, &b);
        AVLInsert(tree, &d);

        TEST_CASE("Remove node with two children (c)");
        AVLRemove(tree, &c);
        ASSERT_EQ(remove, 4, AVLSize(tree));
        ASSERT_NULL(remove, AVLFind(tree, &c));
        ASSERT_NOT_NULL(remove, AVLFind(tree, &a));
        ASSERT_NOT_NULL(remove, AVLFind(tree, &b));
        ASSERT_NOT_NULL(remove, AVLFind(tree, &d));
        ASSERT_NOT_NULL(remove, AVLFind(tree, &e));
        AVLDestroy(tree);
    }
}
static void Test_ForEach(void)
{
    INIT_SUITE(foreach, "FOREACH");

    int a = 1, b = 2, c = 3, d = 4, e = 5, f = 6;

    avl_t* tree = AVLCreate(IntCmp);

    AVLInsert(tree, &b);
    AVLInsert(tree, &a);
    AVLInsert(tree, &c);
    AVLInsert(tree, &d);
    AVLInsert(tree, &e);
    AVLInsert(tree, &f);

    printf("Tree Before incrementation:\n");
#ifndef NDEBUG
    AVLPrint(tree, PrintInt);
#endif /*NDEBUG*/
    AVLForEach(tree, PlusOne, IN_ORDER, NULL);
    printf("Tree After incrementation:\n");
#ifndef NDEBUG
    AVLPrint(tree, PrintInt);
#endif /*NDEBUG*/

    printf("Tree Before doubling:\n");
#ifndef NDEBUG
    AVLPrint(tree, PrintInt);
#endif /*NDEBUG*/
    AVLForEach(tree, Double, IN_ORDER, NULL);
    printf("Tree After doubling:\n");
#ifndef NDEBUG
    AVLPrint(tree, PrintInt);
#endif /*NDEBUG*/

    printf("Tree Before blazing:\n");
#ifndef NDEBUG
    AVLPrint(tree, PrintInt);
#endif /*NDEBUG*/
    AVLForEach(tree, MakeAll420, IN_ORDER, NULL);
    printf("Tree After blazing:\n");
#ifndef NDEBUG
    AVLPrint(tree, PrintInt);
#endif /*NDEBUG*/
    printf("Tree Before Ascension:\n");
#ifndef NDEBUG
    AVLPrint(tree, PrintInt);
#endif /*NDEBUG*/
    AVLForEach(tree, MakeAscending, PRE_ORDER, NULL);
    printf("Tree After Ascension:\n");
#ifndef NDEBUG
    AVLPrint(tree, PrintInt);
#endif /*NDEBUG*/

    AVLDestroy(tree);

    printf("== [%s] %d/%d Passed ==\n", foreach.name, foreach.passed,
           foreach.total);
}
static void Test_Find(void)
{
    INIT_SUITE(find, "FIND");

    int a = 1, b = 2, c = 3, d = 4, e = 5, f = 6, m = 42;

    int to_find = 3;
    avl_t* tree = AVLCreate(IntCmp);

    AVLInsert(tree, &b);
    AVLInsert(tree, &a);
    AVLInsert(tree, &c);
    AVLInsert(tree, &d);
    AVLInsert(tree, &e);
    AVLInsert(tree, &f);
#ifndef NDEBUG
    AVLPrint(tree, PrintInt);
#endif /*NDEBUG*/

    RUN_TEST(find, "AVLFind(`non-existent` returned NULL",
             AVLFind(tree, &m) == NULL);
    RUN_TEST(find, "AVLFind(`existent` returned Non-NULL",
             AVLFind(tree, &to_find) != NULL);

    AVLDestroy(tree);

    printf("== [%s] %d/%d Passed ==\n", find.name, find.passed, find.total);
}

#define SIZE (20)
#define NUM_QUERIES (9999)

static void Test_StressLoad(void)
{
    size_t i = 0;
    int big_arr[SIZE] = {0};
    int to_find = SIZE - 1;
    clock_t start = 0;
    clock_t end = 0;
    double time_taken = 0;
    float completed = 0;

    avl_t* avl = AVLCreate(IntCmp);
    avl_t* bst_rec = AVLCreate(IntCmp);
    bst_t* bst = BSTCreate(IntCmp);
    volatile int* sink = NULL;
    volatile bst_iter_t sink_iter = NULL;

    while (i < SIZE)
    {
        big_arr[i] = i;

        AVLInsert(avl, big_arr + i);
        BSTInsertRec(bst_rec, big_arr + i);
        BSTInsert(bst, big_arr + i);

        completed = (float) i / SIZE * 100;
        printf("50K INSERTIONS: %.2f%% Completed\n", completed);

        ++i;
    }

    /* Time AVL */
    cmp_count = 0;
    {
        start = clock();
        for (i = 0; i < NUM_QUERIES; ++i)
        {
            sink = AVLFind(avl, &to_find);
        }
        end = clock();
        time_taken = (double) (end - start) / CLOCKS_PER_SEC;
        printf("AVLFind on a BALANCED %d (%d queries) took %f seconds and %lu "
               "comparisons\n",
               to_find, NUM_QUERIES, time_taken, cmp_count);
    }

    /* Time BST_Recursive */

    cmp_count = 0;
    {
        start = clock();
        for (i = 0; i < NUM_QUERIES; ++i)
        {
            sink = AVLFind(bst_rec, &to_find);
        }
        end = clock();
        time_taken = (double) (end - start) / CLOCKS_PER_SEC;
        printf("AVLFind on a NON-BALANCED %d (%d queries) took %f seconds and "
               "%lu comparisons\n",
               to_find, NUM_QUERIES, time_taken, cmp_count);
    }

    /* Time BST */
    cmp_count = 0;
    {
        start = clock();
        for (i = 0; i < NUM_QUERIES; ++i)
        {
            sink_iter = BSTFind(bst, &to_find);
        }
        end = clock();
        time_taken = (double) (end - start) / CLOCKS_PER_SEC;
        printf("BSTFind (Iterative) %d (%d queries) took %f seconds and %lu "
               "comparisons\n",
               to_find, NUM_QUERIES, time_taken, cmp_count);
    }

    (void) sink;
    (void) sink_iter;

    AVLDestroy(avl);
    printf("Destroyed AVL\n");
    AVLDestroy(bst_rec);
    printf("Destroyed BST_REC\n");
    BSTDestroy(bst);
    printf("Destroyed BST\n");
}

int main(void)
{
    size_t i = 0;
    PRINT_TEST_HEADER("OVERALL");
    printf("===================\n");

    RegisterTests();

    for (i = 0; i < test_count; ++i)
    {
        printf("Running Suite: %s\n", test_registry[i].name);
        test_registry[i].func();
    }

    PRINT_SUMMARY();

    return 0;
}

static void RegisterTests(void)
{
    REGISTER_TEST(Test_Create);
    REGISTER_TEST(Test_Insert);
    REGISTER_TEST(Test_Remove);
    REGISTER_TEST(Test_ForEach);
    REGISTER_TEST(Test_Find);
    REGISTER_TEST(Test_StressLoad);
}
