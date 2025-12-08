/******************
 Author : Ayal Moran
 Reviewer:
 Date:
 *****************/
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include<unistd.h>

#include "UID.h"

/* structs and globals */
#define MAX_TESTS 30

typedef struct {
    const char *name;
    int total;
    int passed;
} test_suite_t;

typedef void (*test_func_t)(void);

typedef struct {
    const char *name;
    test_func_t func;
} named_test_t;

int total_tests = 0;
int passed_tests = 0;
static named_test_t test_registry[MAX_TESTS];
static int test_count = 0;

/*output and colors*/
/* General Formatting */
#define RESET                    (0)
#define BRIGHT                   (1)
#define DIM                      (2)
#define UNDERSCORE               (3)
#define BLINK                    (4)
#define REVERSE                  (5)
#define HIDDEN                   (6)

/* Foreground Colors */
#define FG_BLACK                 (30)
#define FG_RED                   (31)
#define FG_GREEN                 (32)
#define FG_YELLOW                (33)
#define FG_BLUE                  (34)
#define FG_MAGENTA               (35)
#define FG_CYAN                  (36)
#define FG_WHITE                 (37)

/* Background Colors */
#define BG_BLACK                 (40)
#define BG_RED                   (41)
#define BG_GREEN                 (42)
#define BG_YELLOW                (43)
#define BG_BLUE                  (44)
#define BG_MAGENTA               (45)
#define BG_CYAN                  (46)
#define BG_WHITE                 (47)

#define SET_PRINT_COLOR(X) printf("\x1b[%dm", X)

#define PRINT_TEST_HEADER(name) 						\
	do {												\
		SET_PRINT_COLOR(BRIGHT);						\
		SET_PRINT_COLOR(FG_BLUE);						\
		SET_PRINT_COLOR(BG_YELLOW);						\
        printf("=====STARTING %s TESTS=====", name);	\
        printf("===================\n");                \
		SET_PRINT_COLOR(RESET);							\
		printf("\n");									\
    } while(0)

/* value prints and debugging */
#define TRACE() printf("[TRACE] %s:%d\n", __FILE__, __LINE__)
#define SHOW_INT(x) printf("Value of " #x " is %d\n", x)
#define SHOW_CHAR(x) printf("Value of " #x " is %c\n", x)
#define SHOW_SIZE(x) printf("Size of " #x " is %lu\n", sizeof(x))
#define SHOW_SIZET(x) printf("Value of " #x " is %lu\n", x)
#define SHOW_PTR(x) printf("Value of " #x " is %p\n", (void*)x)
#define SHOW_STR(x) printf("Value of " #x " is %s\n", x)
#define SHOW_FLOAT(x) printf("Value of " #x " is %f\n", x)
#define SHOW_DOUBLE(x) printf("Value of " #x " is %lf\n", x)
#define SHOW_LONG(x) printf("Value of " #x " is %ld\n", x)
#define SHOW_ULONG(x) printf("Value of " #x " is %lu\n", x)

/* assertions */
#define ASSERT_TRUE(suite, expr) \
    RUN_TEST(suite, #expr, (expr))

#define ASSERT_FALSE(suite, expr) \
    RUN_TEST(suite, #expr, !(expr))

#define ASSERT_EQ(suite, expected, actual) \
    RUN_TEST(suite, #expected " == " #actual, (expected) == (actual))

#define ASSERT_NEQ(suite, expected, actual) \
    RUN_TEST(suite, #expected " != " #actual, (expected) != (actual))

#define ASSERT_NULL(suite, ptr) \
    RUN_TEST(suite, #ptr " == NULL", (ptr) == NULL)

#define ASSERT_NOT_NULL(suite, ptr) \
    RUN_TEST(suite, #ptr " != NULL", (ptr) != NULL)

#define ASSERT_STR_EQ(suite, expected, actual) \
    RUN_TEST(suite, #expected " == " #actual, strcmp((expected), (actual)) == 0)

#define ASSERT_MEM_EQ(suite, ptr1, ptr2, size) \
    RUN_TEST(suite, "memcmp(" #ptr1 ", " #ptr2 ", " #size ") == 0", memcmp(ptr1, ptr2, size) == 0)

/*test suites*/

#define TEST_CASE(name) \
    do { printf("\n--- Running Test: %s ---\n", name); } while (0)

#define BEGIN_SUITE(name) \
    do { \
        SET_PRINT_COLOR(BRIGHT); \
        SET_PRINT_COLOR(FG_BLUE); \
        printf("\n========== BEGIN SUITE: %s ==========\n\n", name); \
        SET_PRINT_COLOR(RESET); \
    } while(0)

#define END_SUITE(name) \
    do { \
        SET_PRINT_COLOR(BRIGHT); \
        SET_PRINT_COLOR(FG_BLUE); \
        printf("\n========== END SUITE: %s ==========\n\n", name); \
        SET_PRINT_COLOR(RESET); \
    } while(0)

#define INIT_SUITE(suite, suite_name)  \
    test_suite_t suite = {suite_name, 0, 0}

#define RUN_TEST(suite, desc, expr)       \
    do {                                        \
        ++suite.total;                          \
        ++total_tests;                          \
        if (expr)                               \
        {                                       \
            ++suite.passed;                     \
            ++passed_tests;                     \
            SET_PRINT_COLOR(FG_GREEN);          \
            SET_PRINT_COLOR(BRIGHT);            \
            printf("[PASS] %s [line %d]\n", desc, __LINE__); \
        }                                       \
        else                                    \
        {                                       \
            SET_PRINT_COLOR(FG_RED);            \
            SET_PRINT_COLOR(BRIGHT);            \
            printf("[FAIL] %s [line %d]\n", desc, __LINE__); \
        }                                       \
        SET_PRINT_COLOR(RESET);                 \
    } while (0)


#define PRINT_SUITE_SUMMARY(suite) \
    printf("== [%s] %d/%d Passed ==\n", suite.name, suite.passed, suite.total)


#define REGISTER_TEST(function)                          \
    do {                                              \
        if (test_count < MAX_TESTS) {                \
            test_registry[test_count].name = #function;  \
            test_registry[test_count].func = function;   \
            ++test_count;                            \
        } else {                                      \
            fprintf(stderr, "[ERROR] Max test limit reached\n"); \
            exit(1);                                  \
        }                                             \
    } while (0)

#define PRINT_SUMMARY()                                         \
    do {                                                        \
        SET_PRINT_COLOR(BRIGHT);                                \
        if (passed_tests == total_tests)                        \
        {                                                       \
            SET_PRINT_COLOR(FG_GREEN);                          \
            printf("=== All tests passed (%d/%d) ===\n",        \
                    passed_tests, total_tests);                 \
        }                                                       \
        else                                                    \
        {                                                       \
            SET_PRINT_COLOR(FG_YELLOW);                         \
            printf("=== Partial success (%d/%d) ===\n",         \
                    passed_tests, total_tests);                 \
        }                                                       \
        SET_PRINT_COLOR(RESET);                                 \
    } while (0)

static void RegisterTests(void);

/******************************************************
 * START OF ACTUAL TESTS
 ******************************************************/
static void Test_Create(void)
{
    INIT_SUITE(create, "CREATE");
	ilrd_uid_t uid2 ={0};
    ilrd_uid_t uid = UIDCreate();
    sleep(1);
    uid2 = UIDCreate();
    RUN_TEST(create, "Create returns uid.counter = 0; ", uid.counter == 0 );
	
	SHOW_INT(uid.ip[0]);
	SHOW_INT(uid.ip[1]);
	SHOW_INT(uid.ip[2]);
	SHOW_INT(uid.ip[3]);
	SHOW_INT(uid.pid);
	SHOW_SIZET(uid.counter);
	SHOW_LONG(uid.time);
	SHOW_INT(uid2.ip[0]);
	SHOW_INT(uid2.ip[1]);
	SHOW_INT(uid2.ip[2]);
	SHOW_INT(uid2.ip[3]);
	SHOW_INT(uid2.pid);
	SHOW_SIZET(uid2.counter);
	SHOW_LONG(uid2.time);


    printf("== [%s] %d/%d Passed ==\n", create.name,
        create.passed, create.total);
}

int main(void)
{
	int i = 0;
    PRINT_TEST_HEADER("OVERALL");
    printf("===================\n");

    RegisterTests();

    for (i = 0; i < test_count; ++i)
    {
        printf("Running Suite: %s\n",     test_registry[i].name);
        test_registry[i].func();
    }

    PRINT_SUMMARY();
    
    return 0;
}

static void RegisterTests(void)
{
    REGISTER_TEST(Test_Create);
}



