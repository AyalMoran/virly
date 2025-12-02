#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "bst.h"

#pragma region utils
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
#define ITALICS (3)
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
        printf("=====STARTING %s TESTS=====\n", name);                         \
        printf("================================\n");                          \
        SET_PRINT_COLOR(RESET);                                                \
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
#define ASSERT_TRUE(suite, expr) RUN_TEST(suite, "TRUE == " #expr, (expr))

#define ASSERT_FALSE(suite, expr) RUN_TEST(suite, "FALSE == " #expr, !(expr))

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
        SET_PRINT_COLOR(BG_YELLOW);                                            \
        SET_PRINT_COLOR(ITALICS);                                              \
        printf("\n========== BEGIN SUITE: %s ==========", name);               \
        SET_PRINT_COLOR(RESET);                                                \
        printf("\n");                                                          \
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

/***********************
 *  HELPER UTILITIES
 ***********************/
typedef struct
{
    int key;
} int_wrap_t;

static int CmpInt(const void* val1, const void* val2)
{
    const int* lhs = (const int*) val1;
    const int* rhs = (const int*) val2;

    if (*lhs < *rhs)
    {
        return -1;
    }
    if (*rhs < *lhs)
    {
        return 1;
    }
    return 0;
}

static int AddOneAction(void* data, void* param)
{
    int* node_val = (int*) data;
    (void) param; /* unused */
    ++(*node_val);
    return 0;
}

/***********************
 *  TEST SUITES
 ***********************/
static void Test_Create(void);
static void Test_InsertFind(void);
static void Test_SizeIsEmpty(void);
static void Test_Traversal(void);
static void Test_Remove(void);
static void Test_ForEach(void);

static void RegisterTests(void)
{
    REGISTER_TEST(Test_Create);
    REGISTER_TEST(Test_SizeIsEmpty);
    REGISTER_TEST(Test_InsertFind);
    REGISTER_TEST(Test_Traversal);
    REGISTER_TEST(Test_Remove);
    REGISTER_TEST(Test_ForEach);
}
#pragma endregion utils

#pragma region tests
/************* Test: Create / Destroy ****************/
static void Test_Create(void)
{
    INIT_SUITE(create, "CREATE");

    bst_t* tree = BSTCreate(CmpInt);
    ASSERT_NOT_NULL(create, tree);

    BSTDestroy(tree);

    PRINT_SUITE_SUMMARY(create);
}
/************* Test: Insert & Find ******************/
static void Test_InsertFind(void)
{
    INIT_SUITE(insert_find, "INSERT_FIND");

    bst_t* tree = BSTCreate(CmpInt);
    int arr[7] = {4, 2, 6, 1, 3, 5, 7};
    size_t i = 0;
    bst_iter_t it = NULL;
    for (i = 0; 7 > i; ++i)
    {
        ASSERT_NOT_NULL(insert_find, BSTInsert(tree, &arr[i]));
    }

    printf("Find Tests: \n");
    for (i = 0; 7 > i; ++i)
    {
        it = BSTFind(tree, &arr[i]);
        ASSERT_FALSE(insert_find, BSTIterIsEqual(it, BSTEnd(tree)));
        ASSERT_EQ(insert_find, &arr[i], BSTGetData(it));
        SHOW_INT(*(int*) BSTGetData(it));
        SHOW_INT(arr[i]);
    }
    /* non-existent */
    {
        int not_in_tree = 42;
        bst_iter_t it = BSTFind(tree, &not_in_tree);

        ASSERT_TRUE(insert_find, BSTIterIsEqual(it, BSTEnd(tree)));
    }

    BSTDestroy(tree);
    PRINT_SUITE_SUMMARY(insert_find);
}
/************* Test: Size & IsEmpty *****************/
static void Test_SizeIsEmpty(void)
{
    INIT_SUITE(size_empty, "SIZE_EMPTY");

    bst_t* tree = BSTCreate(CmpInt);

    ASSERT_TRUE(size_empty, BSTIsEmpty(tree));
    ASSERT_EQ(size_empty, 0, BSTSize(tree));

    {
        int val = 10;
        BSTInsert(tree, &val);
    }

    ASSERT_FALSE(size_empty, BSTIsEmpty(tree));
    ASSERT_EQ(size_empty, 1, BSTSize(tree));

    BSTDestroy(tree);
    PRINT_SUITE_SUMMARY(size_empty);
}
/************* Test: Traversal Order ***************/
static void Test_Traversal(void)
{
    INIT_SUITE(traversal, "TRAVERSAL");

    size_t i = 0;
    int arr[7] = {4, 2, 6, 1, 3, 5, 7};
    const int expected_in_order[7] = {1, 2, 3, 4, 5, 6, 7};
    const int expected_reverse_order[7] = {7, 6, 5, 4, 3, 2, 1};
    int arr2[20] = {53, 1,  86, 56, 48, 55, 20, 34,  75,  105,
                    62, 22, 12, 3,  88, 99, 11, 102, 402, 15};
    const int expected2[20] = {1,  3,  11, 12, 15, 20, 22, 34,  48,  53,
                               55, 56, 62, 75, 86, 88, 99, 102, 105, 402};
    bst_iter_t it = NULL;
    bst_t* tree = BSTCreate(CmpInt);
    bst_t* tree2 = BSTCreate(CmpInt);

    for (i = 0; 7 > i; ++i)
    {
        BSTInsert(tree, &arr[i]);
    }
    for (i = 0; 20 > i; ++i)
    {
        BSTInsert(tree2, &arr2[i]);
    }

    i = 0;
    for (it = BSTBegin(tree); !BSTIterIsEqual(it, BSTEnd(tree));
         it = BSTNext(it), ++i)
    {
        ASSERT_EQ(traversal, expected_in_order[i], *(int*) BSTGetData(it));
        SHOW_INT(*(int*) BSTGetData(it));
    }

    ASSERT_EQ(traversal, 7, i);

    {
        for (i = 0, it = BSTPrev(BSTEnd(tree));
             !BSTIterIsEqual(it, BSTBegin(tree)) && i < 7;
             ++i, it = BSTPrev(it))
        {
            ASSERT_EQ(traversal, expected_reverse_order[i],
                      *(int*) BSTGetData(it));
            SHOW_INT(*(int*) BSTGetData(it));
        }
        ASSERT_EQ(traversal, expected_reverse_order[i], *(int*) BSTGetData(it));
        SHOW_INT(*(int*) BSTGetData(it));
    }

    {
        for (it = BSTBegin(tree2), i = 0; !BSTIterIsEqual(it, BSTEnd(tree2));
             it = BSTNext(it), ++i)
        {
            ASSERT_EQ(traversal, expected2[i], *(int*) BSTGetData(it));
            SHOW_INT(*(int*) BSTGetData(it));
        }
        ASSERT_EQ(traversal, 20, i);
    }

    BSTDestroy(tree);
    BSTDestroy(tree2);

    PRINT_SUITE_SUMMARY(traversal);
}
/************* Test: Remove *************************/
static void Test_Remove(void)
{
    INIT_SUITE(remove, "REMOVE");

    bst_t* tree = BSTCreate(CmpInt);
    int arr[7] = {4, 2, 6, 1, 3, 5, 7};
    size_t i = 0;

    for (i = 0; 7 > i; ++i)
    {
        BSTInsert(tree, &arr[i]);
    }

    /* remove leaf (7) */
    {
        bst_iter_t it = BSTFind(tree, &arr[6]);
        ASSERT_FALSE(remove, BSTIterIsEqual(it, BSTEnd(tree)));
        BSTRemove(it);
        ASSERT_TRUE(remove,
                    BSTIterIsEqual(BSTFind(tree, &arr[6]), BSTEnd(tree)));
        ASSERT_EQ(remove, 6, BSTSize(tree));
    }
    /* remove node with 1 child (6) */
    {
        bst_iter_t it = BSTFind(tree, &arr[2]); /* 6 */
        BSTRemove(it);
        ASSERT_TRUE(remove,
                    BSTIterIsEqual(BSTFind(tree, &arr[2]), BSTEnd(tree)));
        ASSERT_EQ(remove, 5, BSTSize(tree));
    }
    /* remove root (4) – two children */
    {
        bst_iter_t it = BSTFind(tree, &arr[0]); /* 4 */
        BSTRemove(it);
        ASSERT_TRUE(remove,
                    BSTIterIsEqual(BSTFind(tree, &arr[0]), BSTEnd(tree)));
        ASSERT_EQ(remove, 4, BSTSize(tree));
    }

    BSTDestroy(tree);
    PRINT_SUITE_SUMMARY(remove);
}
/************* Test: ForEach ************************/
static void Test_ForEach(void)
{
    INIT_SUITE(foreach, "FOREACH");

    bst_t* tree = BSTCreate(CmpInt);
    int arr[5] = {10, 20, 30, 40, 50};
    size_t i = 0;

    for (i = 0; 5 > i; ++i)
    {
        BSTInsert(tree, &arr[i]);
    }

    ASSERT_EQ(foreach, 0,
              BSTForEach(BSTBegin(tree), BSTEnd(tree), AddOneAction, NULL));

    for (i = 0; 5 > i; ++i)
    {
        int expected = (int) ((i + 1) * 10 + 1); /* each increased by 1 */
        ASSERT_EQ(foreach, expected, arr[i]);
    }

    BSTDestroy(tree);
    PRINT_SUITE_SUMMARY(foreach);
}
#pragma endregion tests
/*  MAIN
 ***********************/
int main(void)
{
    size_t i = 0;
    PRINT_TEST_HEADER("BST");

    RegisterTests();

    for (i = 0; test_count > i; ++i)
    {
        BEGIN_SUITE(test_registry[i].name);
        test_registry[i].func();
        END_SUITE(test_registry[i].name);
    }

    PRINT_SUMMARY();
    return 0;
}
