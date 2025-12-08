
#define _GNU_SOURCE

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>

#include <string.h>
#include <unistd.h>

#include "HashTable.h"

#pragma region test utils
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

#pragma endregion
/************************HELPERS************* */

/************************TESTS DECLARATIONS********************************* */
static void RegisterTests(void);
static void Test_CreateDestroy(void);

/********************************************
 * START OF ACTUAL TESTS
 *******************************************  */
/*
 * === hash_funcs and callbacks === */

static size_t SimpleHash(const void* value)
{
    return (*(int*) value) % 10;
}

static size_t StringHash(const void* str)
{
    const char* s = (const char*) str;
    size_t hash = 0;
    size_t p = 31;
    size_t pow_p = 1;

    for (; *s != '\0'; ++s)
    {
        hash += (*s) * pow_p;
        pow_p *= p;
    }

    return hash;
}

static int SimpleIntMatch(const void* data, const void* key, void* param)
{
    (void) param;
    return *(int*) data == *(int*) key;
}

static int StringMatch(const void* data, const void* key, void* param)
{
    (void) param;
    return (!strcmp((char*) data, (char*) key));
}

int IncByOne(void* data, void* param)
{
    *(int*) data = *(int*) data + 1;

    (void) param;

    return 0;
}

/*
 * ************************TESTS
 * IMPLEMENTATIONS*********************************
 */
static void Test_CreateDestroy(void)
{
    INIT_SUITE(create, "Create/Destroy");

    TEST_CASE("Initial create:");
    {
        hash_table_t* table = HashTableCreate(10, SimpleHash, SimpleIntMatch);

        RUN_TEST(create, "HashTableCreate return non-NULL", table != NULL);

        HashTableDestroy(table);
    }
    PRINT_SUITE_SUMMARY(create);
}

static void Test_InsertRemove(void)
{
    INIT_SUITE(insert_remove, "insert_remove");

    TEST_CASE("Inserting One element and removing it:");
    {
        int a = 1;
        hash_table_status_t status = HASH_TABLE_SUCCESS;

        hash_table_t* table = HashTableCreate(10, SimpleHash, SimpleIntMatch);

        status = HashTableInsert(table, &a, &a);
        ASSERT_EQ(insert_remove, HASH_TABLE_SUCCESS, status);
        HashTableRemove(table, &a, NULL);
        status = HashTableInsert(table, &a, &a);
        ASSERT_EQ(insert_remove, HASH_TABLE_SUCCESS, status);

        HashTableDestroy(table);
    }

    TEST_CASE("Inserting multiple elements and removing them:");
    {
        int a = 1, b = 17, d = 40, f = 62;
        int removed = 0;
        hash_table_status_t status = HASH_TABLE_SUCCESS;

        hash_table_t* table = HashTableCreate(10, SimpleHash, SimpleIntMatch);

        status = HashTableInsert(table, &a, &a);
        ASSERT_EQ(insert_remove, HASH_TABLE_SUCCESS, status);
        status = HashTableInsert(table, &b, &b);
        ASSERT_EQ(insert_remove, HASH_TABLE_SUCCESS, status);
        status = HashTableInsert(table, &f, &f);
        ASSERT_EQ(insert_remove, HASH_TABLE_SUCCESS, status);
        status = HashTableInsert(table, &d, &d);
        ASSERT_EQ(insert_remove, HASH_TABLE_SUCCESS, status);
        removed = *(int*) HashTableRemove(table, &f, NULL);
        ASSERT_EQ(insert_remove, f, removed);
        removed = *(int*) HashTableRemove(table, &a, NULL);
        ASSERT_EQ(insert_remove, a, removed);
        ASSERT_EQ(insert_remove, NULL, HashTableRemove(table, &a, NULL));
        ASSERT_EQ(insert_remove, NULL, HashTableRemove(table, &f, NULL));
        removed = *(int*) HashTableRemove(table, &b, NULL);
        ASSERT_EQ(insert_remove, b, removed);

        status = HashTableInsert(table, &a, &a);
        ASSERT_EQ(insert_remove, HASH_TABLE_SUCCESS, status);
        removed = *(int*) HashTableRemove(table, &a, NULL);
        ASSERT_EQ(insert_remove, a, removed);
        status = HashTableInsert(table, &a, &a);
        ASSERT_EQ(insert_remove, HASH_TABLE_SUCCESS, status);

        HashTableDestroy(table);
    }
    PRINT_SUITE_SUMMARY(insert_remove);
}

static void Test_SizeAndEmpty(void)
{
    INIT_SUITE(SizeAndIsEmpty, "SizeAndIsEmpty");

    TEST_CASE("Inserting and removing multiple elements element  and size "
              "updates accordingly:");
    {
        int a = 1, b = 11, c = 20, d = 40, e = 50, f = 60;
        hash_table_status_t status = HASH_TABLE_SUCCESS;

        hash_table_t* table = HashTableCreate(10, SimpleHash, SimpleIntMatch);

        status = HashTableInsert(table, &a, &a);
        ASSERT_EQ(SizeAndIsEmpty, HASH_TABLE_SUCCESS, status);
        ASSERT_EQ(SizeAndIsEmpty, 1, HashTableSize(table));
        status = HashTableInsert(table, &b, &b);
        ASSERT_EQ(SizeAndIsEmpty, HASH_TABLE_SUCCESS, status);
        ASSERT_EQ(SizeAndIsEmpty, 2, HashTableSize(table));

        status = HashTableInsert(table, &c, &c);
        ASSERT_EQ(SizeAndIsEmpty, HASH_TABLE_SUCCESS, status);
        status = HashTableInsert(table, &d, &d);
        ASSERT_EQ(SizeAndIsEmpty, HASH_TABLE_SUCCESS, status);
        ASSERT_EQ(SizeAndIsEmpty, 4, HashTableSize(table));

        /*size doesnt change: duplicates elements*/
        status = HashTableInsert(table, &e, &e);
        ASSERT_EQ(SizeAndIsEmpty, HASH_TABLE_SUCCESS, status);
        status = HashTableInsert(table, &f, &f);
        ASSERT_EQ(SizeAndIsEmpty, HASH_TABLE_SUCCESS, status);
        ASSERT_EQ(SizeAndIsEmpty, 6, HashTableSize(table));
        ASSERT_FALSE(SizeAndIsEmpty, HashTableIsEmpty(table));

        HashTableDestroy(table);
    }

    TEST_CASE("Stress test:");
    {
        hash_table_status_t status = HASH_TABLE_SUCCESS;
        int arr[1000] = {0};
        int i = 0;
        int removed = 0;
        hash_table_t* table = HashTableCreate(1000, SimpleHash, SimpleIntMatch);

        while (i < 1000)
        {
            arr[i] = i;
            ++i;
        }
        i = 0;
        while (i < 1000 && status == HASH_TABLE_SUCCESS)
        {
            status = HashTableInsert(table, arr + i, arr + i);
            ++i;
        }

        ASSERT_EQ(SizeAndIsEmpty, HASH_TABLE_SUCCESS, status);
        ASSERT_EQ(SizeAndIsEmpty, 1000, HashTableSize(table));
        for (i = 0; i < 1000; ++i)
        {
            removed = *(int*) HashTableRemove(table, arr + i, NULL);
            if (removed != arr[i])
            {
                break;
            }
        }
        ASSERT_EQ(SizeAndIsEmpty, arr[i - 1], removed);
        ASSERT_EQ(SizeAndIsEmpty, i, 1000);
        ASSERT_EQ(SizeAndIsEmpty, 0, HashTableSize(table));
        SHOW_SIZET(i);
        SHOW_SIZET(HashTableSize(table));

        HashTableDestroy(table);
    }

    PRINT_SUITE_SUMMARY(SizeAndIsEmpty);
}

static void Test_Find(void)
{
    INIT_SUITE(find, "find");

    TEST_CASE("Inserting one element and trying to find it:");
    {
        int a = 1, b = 11;

        hash_table_t* table = HashTableCreate(10, SimpleHash, SimpleIntMatch);

        HashTableInsert(table, &a, &a);
        ASSERT_EQ(find, HashTableFind(table, &a, NULL), &a);

        HashTableDestroy(table);
    }

    TEST_CASE("Trying to find something that does not exist:");
    {
        int a = 1, b = 11;

        hash_table_t* table = HashTableCreate(10, SimpleHash, SimpleIntMatch);

        HashTableInsert(table, &a, &a);
        ASSERT_EQ(find, HashTableFind(table, &b, NULL), NULL);

        HashTableDestroy(table);
    }

    TEST_CASE("Trying to find something in an empty lsit:");
    {
        int b = 11;

        hash_table_t* table = HashTableCreate(10, SimpleHash, SimpleIntMatch);

        ASSERT_EQ(find, HashTableFind(table, &b, NULL), NULL);

        HashTableDestroy(table);
    }

    TEST_CASE("Trying to find something that was once in the list but not "
              "anymore (what was was was):");
    {
        int a = 1;

        hash_table_t* table = HashTableCreate(10, SimpleHash, SimpleIntMatch);

        HashTableInsert(table, &a, &a);
        HashTableRemove(table, &a, NULL);
        ASSERT_EQ(find, HashTableFind(table, &a, NULL), NULL);

        HashTableDestroy(table);
    }

    PRINT_SUITE_SUMMARY(find);
}

static void Test_ForEach(void)
{
    INIT_SUITE(foreach, "find");

    TEST_CASE("incrementing every element by one");
    {
        int arr[20] = {0};
        int expected[20] = {0};
        int condition = 1;
        size_t i = 0;
        int status = HASH_TABLE_SUCCESS;

        hash_table_t* table = HashTableCreate(10, SimpleHash, SimpleIntMatch);

        while (i < 20)
        {
            arr[i] = i;
            expected[i] = i + 1;

            ++i;
        }

        i = 0;

        while (i < 20 && status == HASH_TABLE_SUCCESS)
        {
            status = HashTableInsert(table, arr + i, arr + i);
            ++i;
        }

        HashTableForEach(table, IncByOne, NULL);

        while (i < 20 && condition == 1)
        {
            condition = (arr[i] == expected[i]);
            ++i;
        }

        ASSERT_TRUE(foreach, condition);

        HashTableDestroy(table);
    }

    PRINT_SUITE_SUMMARY(foreach);
}

static void Test_SpellChecker(void)
{
    FILE* fp;
    char* line = NULL;
    char* copy = NULL;
    size_t len = 0;
    ssize_t read = 0;
    size_t word_count = 0;
    char c;
    hash_table_t* dict = NULL;
    char user_buffer[256] = {0};
    char* ret = NULL;

    fp = fopen("/usr/share/dict/american-english", "r");
    if (fp == NULL)
    {
        exit(EXIT_FAILURE);
    }

    while ((c = getc(fp)) != EOF)
    {
        if (c == '\n')
        {
            ++word_count;
        }
    }

    dict = HashTableCreate(word_count, StringHash, StringMatch);

    while ((read = getline(&line, &len, fp)) != -1)
    {
        copy = strdup(line);
        HashTableInsert(dict, copy, copy);
    }

    printf("Enter a word ('STOP_NOW' to exit): \n");
    while (0 != strcmp(fgets(user_buffer, 256, stdin), "STOP_NOW\n"))
    {
        ret = HashTableFind(dict, user_buffer, NULL);
        if (NULL != ret)
        {
            printf("The word '%s' is in the dictionary. \n", ret);
        }
        else
        {
            printf("Not in dictionary. \n");
        }
        printf("Enter a word ('STOP_NOW' to exit): \n");
    }
    printf("Byebye! \n");
}

/******************************************************
 * MAIN
 ******************************************************/
int main(void)
{
    size_t i = 0;

    /*    PrintMsg("Welcome To Ayal\'s Test Suit!");*/

    PRINT_TEST_HEADER("OVERALL");

    RegisterTests();

    for (; i < test_count; ++i)
    {
        BEGIN_SUITE(test_registry[i].name);
        test_registry[i].func();
        END_SUITE(test_registry[i].name);
    }

    PRINT_SUMMARY();

    /*    if(passed_tests == total_tests)*/
    /*    {*/
    /*	    PrintAllTestsPassed();*/
    /*    }*/
    return 0;
}

static void RegisterTests(void)
{
    REGISTER_TEST(Test_CreateDestroy);
    REGISTER_TEST(Test_InsertRemove);
    REGISTER_TEST(Test_SizeAndEmpty);
    REGISTER_TEST(Test_Find);
    REGISTER_TEST(Test_ForEach);
/* REGISTER_TEST(Test_SpellChecker); */ }