
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

#include "Sort.h"

#pragma region "Testing Utils"
/*PRINTING AND STYLING AND TEST STUFF*/
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
#pragma endregion "Testing Utils"

/*=================================================================*/
/******************************************************
 * START OF ACTUAL TESTS
 ******************************************************/
#define SIZE (5000)

/*=======STATIC DECLARATIONS==========================*/
static void Test_BubbleSort(void);
static void Test_SelectionSort(void);
static void Test_InsertionSort(void);

static void Test_CountingSort(void);
static void Test_RadixSort(void);

static int IsSortedArray(int arr[], size_t size);

static void InitRandom(int arr[], size_t size);
static void InitReverse(int arr[], size_t size);
static void InitZigZag(int arr[], size_t size);

static void InitRandomMod100(int arr[], size_t size);
static void PrintIntArr(int* arr, size_t size);

static void RegisterTests(void);
/*
 *=======HELPERS ==========================*/
#pragma region "Helpers"

static int IsSortedArray(int arr[], size_t size)
{
    int boolean = 1;
    size_t i = 1;

    while (i < size)
    {
        if (arr[i] < arr[i - 1])
        {
            boolean = 0;
            break;
        }

        ++i;
    }

    return boolean;
}

static void InitRandom(int arr[], size_t size)
{
    size_t i = 0;

    while (i < size)
    {
        srand(i);
        arr[i] = rand();
        ++i;
    }
}

static void InitReverse(int arr[], size_t size)
{
    size_t i = 0;

    while (i < size)
    {
        arr[i] = size - i;

        ++i;
    }
}

static void InitZigZag(int arr[], size_t size)
{
    size_t i = 0;

    while (i < size)
    {
        arr[i] = i % 2;
        ++i;
    }
}

static void InitRandomMod100(int arr[], size_t size)
{
    size_t i = 0;

    while (i < size)
    {
        srand(i);
        arr[i] = (rand() % 100) == 0 ? 1 : rand() % 100;
        ++i;
    }
}
/*==================*/
#pragma endregion "Statics"
/*=======TEST IMPLEMENTATIONS========================*/

static void Test_BinarySearchIterative(void)
{
    /* ONLY CHANGE NAME */
    INIT_SUITE(iterbin, "ITER BINARY SEARCH");
    /*=================================================*/

    size_t size = 10;

    TEST_CASE("Array of a single cell");
    {
        int arr[1] = {30035};
        int target = 30035;
        int* return_ptr = NULL;
        return_ptr = BinarySearchIterative(arr, 1, target);
        ASSERT_EQ(iterbin, *return_ptr, arr[0]);
    }

    TEST_CASE("All Zero Array");
    {
        int arr[10] = {0};
        int target = 0;
        int* return_ptr = NULL;

        return_ptr = BinarySearchIterative(arr, size, target);
        ASSERT_EQ(iterbin, *return_ptr, target);
        SHOW_INT(*return_ptr);
    }

    TEST_CASE("sorted negative array");
    {
        int arr[10] = {-24, -21, -19, -10, -8, -6, -5, -4, -3, -2};
        int target = -10;
        int* return_ptr = NULL;
        return_ptr = BinarySearchIterative(arr, size, target);
        ASSERT_EQ(iterbin, *return_ptr, target);
        SHOW_INT(*return_ptr);
    }

    TEST_CASE("sorted positive array");
    {
        int arr[10] = {2, 6, 8, 14, 24, 54, 256, 3457, 4455, 6666};
        int target = 24;
        int* return_ptr = NULL;

        return_ptr = BinarySearchIterative(arr, size, target);
        ASSERT_EQ(iterbin, *return_ptr, target);
        SHOW_INT(*return_ptr);
    }

    TEST_CASE("sorted mixed array");
    {
        int arr[10] = {-250, -32, -10, -2, 24, 54, 256, 3457, 4455, 6666};
        int* return_ptr = NULL;
        int target = 54;
        return_ptr = BinarySearchIterative(arr, size, target);
        ASSERT_EQ(iterbin, *return_ptr, target);
        SHOW_INT(*return_ptr);
    }
    /* PRINTING SUMMARY*/
    PRINT_SUITE_SUMMARY(iterbin);
    /*=================================================*/
}

static void Test_BinarySearchRecursive(void)
{
    /* ONLY CHANGE NAME */
    INIT_SUITE(recbin, "REC BINARY SEARCH");
    /*=================================================*/

    size_t size = 10;

    TEST_CASE("Array of a single cell");
    {
        int arr[1] = {30035};
        int target = 30035;
        int* return_ptr = NULL;
        return_ptr = BinarySearchIterative(arr, 1, target);
        ASSERT_EQ(recbin, *return_ptr, arr[0]);
    }

    TEST_CASE("All Zero Array");
    {
        int arr[10] = {0};
        int target = 0;
        int* return_ptr = NULL;

        return_ptr = BinarySearchIterative(arr, size, target);
        ASSERT_EQ(recbin, *return_ptr, target);
        SHOW_INT(*return_ptr);
    }

    TEST_CASE("sorted negative array");
    {
        int arr[10] = {-24, -21, -19, -10, -8, -6, -5, -4, -3, -2};
        int target = -10;
        int* return_ptr = NULL;
        return_ptr = BinarySearchIterative(arr, size, target);
        ASSERT_EQ(recbin, *return_ptr, target);
        SHOW_INT(*return_ptr);
    }

    TEST_CASE("sorted positive array");
    {
        int arr[10] = {2, 6, 8, 14, 24, 54, 256, 3457, 4455, 6666};
        int target = 24;
        int* return_ptr = NULL;

        return_ptr = BinarySearchIterative(arr, size, target);
        ASSERT_EQ(recbin, *return_ptr, target);
        SHOW_INT(*return_ptr);
    }

    TEST_CASE("sorted mixed array");
    {
        int arr[10] = {-250, -32, -10, -2, 24, 54, 256, 3457, 4455, 6666};
        int* return_ptr = NULL;
        int target = 54;
        return_ptr = BinarySearchIterative(arr, size, target);
        ASSERT_EQ(recbin, *return_ptr, target);
        SHOW_INT(*return_ptr);
    }

    /* PRINTING SUMMARY*/
    PRINT_SUITE_SUMMARY(recbin);
    /*=================================================*/
}

static void Test_RecMergeSort(void)
{
    INIT_SUITE(RecMerge, "RecMerge Sort");
    /*
     * =================================================*/

    TEST_CASE("Array of a single cell");
    {
        int arr[1] = {30035};
        MergeSort(arr, 1);
        ASSERT_EQ(RecMerge, 30035, arr[0]);
    }

    TEST_CASE("All Zero Array");
    {
        int arr[10] = {0};
        MergeSort(arr, 10);
        ASSERT_TRUE(RecMerge, IsSortedArray(arr, 10));
    }

    TEST_CASE("Reversed order array");
    {
        int arr[10];

        InitReverse(arr, 10);
        PrintIntArr(arr, 10);
        MergeSort(arr, 10);
        PrintIntArr(arr, 10);

        ASSERT_TRUE(RecMerge, IsSortedArray(arr, 10));
    }

    TEST_CASE("ZigZag Array");
    {
        int arr[10];

        InitZigZag(arr, 10);
        PrintIntArr(arr, 10);
        MergeSort(arr, 10);
        PrintIntArr(arr, 10);

        ASSERT_TRUE(RecMerge, IsSortedArray(arr, 10));
    }

    TEST_CASE("Random array");
    {
        int arr[10];

        InitRandom(arr, 10);
        PrintIntArr(arr, 10);
        MergeSort(arr, 10);
        PrintIntArr(arr, 10);

        ASSERT_TRUE(RecMerge, IsSortedArray(arr, 10));
    }
}

static int IntCompare(const void* a, const void* b)
{
    int int_a = *(const int*) a;
    int int_b = *(const int*) b;
    return (int_a > int_b) - (int_a < int_b);
}

static void Test_QuickSort(void)
{
    INIT_SUITE(QuickSortSuite, "QuickSort");
    /*
     * ================================================= */

    TEST_CASE("Array of a single cell");
    {
        int arr[1] = {30035};
        PrintIntArr(arr, 1);
        QuickSort(arr, 1, sizeof(int), IntCompare);
        PrintIntArr(arr, 1);

        ASSERT_EQ(QuickSortSuite, 30035, arr[0]);
    }

    TEST_CASE("All Zero Array");
    {
        int arr[10] = {0};
        PrintIntArr(arr, 10);
        QuickSort(arr, 10, sizeof(int), IntCompare);
        PrintIntArr(arr, 10);

        ASSERT_TRUE(QuickSortSuite, IsSortedArray(arr, 10));
    }

    TEST_CASE("Reversed order array");
    {
        int arr[10];

        InitReverse(arr, 10);
        PrintIntArr(arr, 10);
        QuickSort(arr, 10, sizeof(int), IntCompare);
        PrintIntArr(arr, 10);

        ASSERT_TRUE(QuickSortSuite, IsSortedArray(arr, 10));
    }

    TEST_CASE("ZigZag Array");
    {
        int arr[10];

        InitZigZag(arr, 10);
        PrintIntArr(arr, 10);
        QuickSort(arr, 10, sizeof(int), IntCompare);
        PrintIntArr(arr, 10);

        ASSERT_TRUE(QuickSortSuite, IsSortedArray(arr, 10));
    }

    TEST_CASE("Random array");
    {
        int arr[10];

        InitRandom(arr, 10);
        PrintIntArr(arr, 10);
        QuickSort(arr, 10, sizeof(int), IntCompare);
        PrintIntArr(arr, 10);

        ASSERT_TRUE(QuickSortSuite, IsSortedArray(arr, 10));
    }
    /* PRINTING SUMMARY*/
    PRINT_SUITE_SUMMARY(QuickSortSuite);
    /*=================================================*/
}

/* Main */
int main(void)
{
    size_t i = 0;

    PRINT_TEST_HEADER("COMPARISON SORT ALGORITHMS");
    RegisterTests();

    for (; i < test_count; ++i)
    {
        SET_PRINT_COLOR(BRIGHT);
        SET_PRINT_COLOR(FG_BLUE);
        SET_PRINT_COLOR(UNDERSCORE);
        printf("\n===== RUNNING %s =====\n", test_registry[i].name);
        SET_PRINT_COLOR(RESET);

        test_registry[i].func();
    }

    SET_PRINT_COLOR(BRIGHT);
    if (passed_tests == total_tests)
    {
        SET_PRINT_COLOR(FG_GREEN);
        printf("=== All tests passed (%d/%d) ===\n", passed_tests, total_tests);
    }
    else
    {
        SET_PRINT_COLOR(FG_YELLOW);
        printf("=== Partial success (%d/%d) ===\n", passed_tests, total_tests);
    }
    SET_PRINT_COLOR(RESET);

    return 0;
}

static void RegisterTests(void)
{
    /* REGISTER_TEST(Test_BubbleSort);
    REGISTER_TEST(Test_SelectionSort);
    REGISTER_TEST(Test_InsertionSort);
    REGISTER_TEST(Test_CountingSort);
    REGISTER_TEST(Test_RadixSort); */
    REGISTER_TEST(Test_BinarySearchIterative);
    REGISTER_TEST(Test_BinarySearchRecursive);
    REGISTER_TEST(Test_RecMergeSort);
    /* 
    REGISTER_TEST(Test_QSort);
    REGISTER_TEST(Test_HeapSort); */
}

static void PrintIntArr(int* arr, size_t size)
{
    size_t i;
    printf("Printing Array: \n");
    printf("====================================\n");
    for (i = 0; i < size; ++i)
    {
        printf("%d ", arr[i]);
    }
    printf("\n");
    printf("End of Array\n");
    printf("====================================\n");
}