#include <assert.h>
#include <graphics.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

#define PI (3.14159265)

#include "Scheduler.h"

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

static void RegisterTests(void);

/************************HELPERS******************************* */
static int CbIncCounter(void* param);
static int CbCollectOrder(void* param);
static int CbRepeatWithStop(void* param);
static void CleanupFree(void* param);
static void CleanupVoid(void* param);
static int SchedStopWrapper(void* sched);

/************************TESTS DECLARATIONS********************************* */
static void Test_CreateDestroy(void);
static void Test_SizeEmptyAdd(void);
static void Test_AddRunSingle(void);
static void Test_AddMultipleOrder(void);
static void Test_Remove(void);
static void Test_Clear(void);
static void Test_Repeating(void);
static void Test_Stop(void);
static void Test_StressManyTasks(void);
static void Test_SelfRemove(void);
static void Test_AddInsideCallback(void);
static void Test_AddTaskInterleaving(void);
static void Test_ClearInsideCallback(void);

/************************CALLBACKS********************************* */

/* callback forward declarations (needed sometimes)*/
static int CbAddTaskInterleaving1(void* param);
static int CbAddTaskInterleaving2(void* param);

/* callback functions */
static int CbIncCounter(void* param)
{
    ++(*(size_t*) param);
    return 0;
}
typedef struct order
{
    int* out_arr;
    size_t* idx;
    int val;
} order_t;

static int CbCollectOrder(void* param)
{
    order_t* ctx = (order_t*) param;

    ctx->out_arr[*(ctx->idx)] = ctx->val;
    ++(*(ctx->idx));

    return 0;
}

static int DummyTask(void* param)
{
    (void)param;
    return 0;
}

/* repeating with stop struct*/
typedef struct repeat
{
    sched_t* sched;
    int* counter;
    int limit;
} repeat_t;

static int CbRepeatWithStop(void* param)
{
    repeat_t* ctx = (repeat_t*) param;

    ++(*(ctx->counter));

    if (*(ctx->counter) == ctx->limit)
    {
        SchedStop(ctx->sched);
    }
    return ctx->limit - *(ctx->counter);
}

/* repeating wiht remove struct*/
typedef struct repeat_with_uid
{
    sched_t* sched;
    int* counter;
    int limit;
    ilrd_uid_t* uid;
} repeat_with_uid_t;

static int CbRepeatWithRemove(void* param)
{
    repeat_with_uid_t* ctx = (repeat_with_uid_t*) param;

    ++(*(ctx->counter));

    if (*(ctx->counter) == ctx->limit)
    {
        SchedRemove(ctx->sched, *(ctx->uid));
    }
    return ctx->limit - *(ctx->counter);
}

/*remove other task*/

typedef struct
{
    sched_t* sched;
    ilrd_uid_t victim_uid;
    int* removed_flag;
} remove_ctx_t;

static int CbRemoveOtherInside(void* param)
{
    remove_ctx_t* ctx = (remove_ctx_t*) param;

    SchedRemove(ctx->sched, ctx->victim_uid);
    *(ctx->removed_flag) = 1; /* confirm callback executed  */

    return 0;
}

/*********************************** */
/* Internal Add struct*/
typedef struct
{
    sched_t* sched;
    int* first_ctr;
    int* second_ctr;
} add_ctx_t;

static int CbAddTaskInside(void* param)
{
    add_ctx_t* ctx = (add_ctx_t*) param;

    ++(*(ctx->first_ctr));

    SchedAdd(ctx->sched, CbIncCounter, CleanupVoid, ctx->second_ctr,
             time(NULL));

    return 0;
}

/* Interleaving struct*/
typedef struct
{
    sched_t* sched;
    int* counter;

} interleaving_ctx_t;

static int CbAddTaskInterleaving1(void* param)
{
    interleaving_ctx_t* ctx = (interleaving_ctx_t*) param;

    ++(*(ctx->counter));

    if (20 == *(ctx->counter))
    {
        SchedStop(ctx->sched);
        return 0;
    }

    SchedAdd(ctx->sched, CbAddTaskInterleaving2, CleanupVoid, ctx, time(NULL));

    return 0;
}

static int CbAddTaskInterleaving2(void* param)
{
    interleaving_ctx_t* ctx = (interleaving_ctx_t*) param;

    ++(*(ctx->counter));

    if (20 == *(ctx->counter))
    {
        SchedStop(ctx->sched);
        return 0;
    }

    SchedAdd(ctx->sched, CbAddTaskInterleaving1, CleanupVoid, ctx, time(NULL));

    return 0;
}

/*clear inside struct and callback*/
typedef struct
{
    sched_t* sched;
    size_t* size_inside;
} clear_ctx_t;

static int CbClearInside(void* param)
{
    clear_ctx_t* ctx = (clear_ctx_t*) param;

    SchedClear(ctx->sched); /* wipe the queue             */
    *(ctx->size_inside) = SchedSize(ctx->sched);

    return 0;
}

/* SchedStop wrapper*/
static int SchedStopWrapper(void* sched)
{
    SchedStop((sched_t*) (sched));
    return 0;
}
/************************CLEANUP FUNCTIONS********************************* */
static void CleanupFree(void* param)
{
    free(param);
}

static void CleanupVoid(void* param)
{
    (void) param;
}

/******************************************************
 * START OF ACTUAL TESTS
 ******************************************************/

/* static int IntCmp(const void* data1, const void* data2)
{
    if (NULL == data1 && NULL == data2)
    {
        return 0;
    }
    else if (NULL == data1)
    {
        return -1;
    }
    else if (NULL == data2)
    {
        return 1;
    }

    return *((const int*) data1) - *((const int*) data2);
}

static int IsMatchEq(const void* data, void* param)
{
    return *((const int*) data) == *((const int*) param);
}
 */
/************************TESTS IMPLEMENTATIONS*********************************
 */

static void Test_CreateDestroy(void)
{
    INIT_SUITE(suite, "Create/Destroy");

    sched_t* sched = SchedCreate();

    ASSERT_NOT_NULL(suite, sched);
    ASSERT_EQ(suite, 0, SchedSize(sched));
    ASSERT_TRUE(suite, SchedIsEmpty(sched));

    SchedDestroy(sched);

    ASSERT_TRUE(suite, 1); /*no crash*/

    PRINT_SUITE_SUMMARY(suite);
}

/********************************************************* */

static void Test_SizeEmptyAdd(void)
{
    INIT_SUITE(suite, "Size/Empty");

    sched_t* sched = SchedCreate();
    time_t now = time(NULL);
    int dummy = 0;

    TEST_CASE("Size/Empty");
    SchedAdd(sched, CbIncCounter, CleanupVoid, &dummy, now);
    ASSERT_EQ(suite, 1, SchedSize(sched));
    ASSERT_FALSE(suite, SchedIsEmpty(sched));

    SchedAdd(sched, CbIncCounter, CleanupVoid, &dummy, now);
    ASSERT_EQ(suite, 2, SchedSize(sched));

    SchedClear(sched);
    ASSERT_TRUE(suite, SchedIsEmpty(sched));
    ASSERT_EQ(suite, 0, SchedSize(sched));

    TEST_CASE("If SchedStop was called from inside the callback");
    SchedAdd(sched, SchedStopWrapper, CleanupVoid, &dummy, now);
    SchedRun(sched);
    ASSERT_EQ(suite, 0, SchedSize(sched));

    SchedDestroy(sched);
    PRINT_SUITE_SUMMARY(suite);
}
/* --------------------------------------------------------------------- */
static void Test_AddRunSingle(void)
{
    INIT_SUITE(suite, "Add & Run(single)");

    sched_t* sched = SchedCreate();
    time_t now = time(NULL);
    int counter = 0;

    ilrd_uid_t uid = SchedAdd(sched, CbIncCounter, CleanupVoid, &counter, now);
    TEST_CASE("Add single task");
    ASSERT_FALSE(suite, UIDIsSame(UIDBadUID, uid));
    ASSERT_EQ(suite, 1, SchedSize(sched));

    SchedRun(sched);
    TEST_CASE("Run single task");
    ASSERT_EQ(suite, 1, counter);
    ASSERT_TRUE(suite, SchedIsEmpty(sched));

    SchedDestroy(sched);
    PRINT_SUITE_SUMMARY(suite);
}
/* --------------------------------------------------------------------- */
static void Test_AddMultipleOrder(void)
{
    INIT_SUITE(suite, "Multiple add - exec order");

    sched_t* sched = SchedCreate();
    time_t now = time(NULL);
    int result[3] = {0};
    size_t idx = 0;
    int expected[3] = {0, 1, 2};

    /* schedule three items 2s, 1s, 0s in the FUTURE – expect 0,1,2 exec */
    order_t* ctx2 = (order_t*) malloc(sizeof(order_t));
    order_t* ctx1 = (order_t*) malloc(sizeof(order_t));
    order_t* ctx0 = (order_t*) malloc(sizeof(order_t));

    ctx2->out_arr = result;
    ctx2->idx = &idx;
    ctx2->val = 2;

    ctx1->out_arr = result;
    ctx1->idx = &idx;
    ctx1->val = 1;

    ctx0->out_arr = result;
    ctx0->idx = &idx;
    ctx0->val = 0;

    SchedAdd(sched, CbCollectOrder, CleanupFree, ctx2, now + 2);
    SchedAdd(sched, CbCollectOrder, CleanupFree, ctx1, now + 1);
    SchedAdd(sched, CbCollectOrder, CleanupFree, ctx0, now + 0);

    SchedRun(sched);
    TEST_CASE("Execution order is preserved and in correct order (unique "
              "priorities)");
    ASSERT_MEM_EQ(suite, result, expected, sizeof(result));

    SchedDestroy(sched);
    PRINT_SUITE_SUMMARY(suite);
}
/* --------------------------------------------------------------------- */
static void Test_Remove(void)
{
    INIT_SUITE(suite, "Remove");

    sched_t* sched = SchedCreate();
    time_t now = time(NULL);
    int counter = 0;

    ilrd_uid_t uid_keep =
        SchedAdd(sched, CbIncCounter, CleanupVoid, &counter, now);
    ilrd_uid_t uid_remove =
        SchedAdd(sched, CbIncCounter, CleanupVoid, &counter, now);

    /* remove second task BEFORE run */
    TEST_CASE("Remove before run");
    SchedRemove(sched, uid_remove);
    ASSERT_EQ(suite, 1, SchedSize(sched));

    TEST_CASE("Run after remove");
    SchedRun(sched);
    ASSERT_EQ(suite, 1, counter); /*only the kept task executed*/

    /* removing invalid UID shouldnt crash or change size*/
    TEST_CASE("Remove invalid UID");
    SchedRemove(sched, UIDBadUID);
    ASSERT_EQ(suite, 0, SchedSize(sched));

    SchedDestroy(sched);
    (void) uid_keep;
    PRINT_SUITE_SUMMARY(suite);
}
/* --------------------------------------------------------------------- */
static void Test_Clear(void)
{
    INIT_SUITE(suite, "Clear");

    sched_t* sched = SchedCreate();
    time_t now = time(NULL);
    int dummy = 0;

    TEST_CASE("Add and clear");
    SchedAdd(sched, CbIncCounter, CleanupVoid, &dummy, now);
    SchedAdd(sched, CbIncCounter, CleanupVoid, &dummy, now);

    ASSERT_EQ(suite, 2, SchedSize(sched));

    SchedClear(sched);
    ASSERT_TRUE(suite, SchedIsEmpty(sched));
    ASSERT_EQ(suite, 0, SchedSize(sched));

    SchedDestroy(sched);
    PRINT_SUITE_SUMMARY(suite);
}

/* --------------------------------------------------------------------- */
static void Test_Repeating(void)
{
    INIT_SUITE(suite, "Repeating tasks");

    sched_t* sched = SchedCreate();
    time_t now = time(NULL);
    int fire_cnt = 0;
    repeat_t ctx = {
        0,
    };

    ctx.sched = sched;
    ctx.counter = &fire_cnt;
    ctx.limit = 3;

    /* repeating every 1s – scheduler stops after 3rd fire internally   */
    TEST_CASE("Add repeating task with stop");
    SchedAdd(sched, CbRepeatWithStop, CleanupVoid, &ctx, now);

    SchedRun(sched);

    ASSERT_EQ(suite, 3, fire_cnt); /* fired exactly 3 times          */
    SHOW_INT(fire_cnt);
    ASSERT_TRUE(suite, SchedIsEmpty(sched));

    SchedDestroy(sched);
    PRINT_SUITE_SUMMARY(suite);
}
/* --------------------------------------------------------------------- */
static void Test_Stop(void)
{
    INIT_SUITE(suite, "External stop");

    sched_t* sched = SchedCreate();
    time_t now = time(NULL);
    int counter = 0;

    /* schedule 4 single-shot tasks, stop after first fires */
    TEST_CASE("Stop after first task fires");
    SchedAdd(sched, CbIncCounter, CleanupVoid, &counter, now + 4);
    SchedAdd(sched, CbIncCounter, CleanupVoid, &counter, now);
    SchedAdd(sched, CbIncCounter, CleanupVoid, &counter, now + 3);
    SchedAdd(sched, SchedStopWrapper, CleanupVoid, sched, now + 1);
    SchedAdd(sched, CbIncCounter, CleanupVoid, &counter, now + 2);

    ASSERT_EQ(suite, 5, SchedSize(sched));

    /* stop after first second */
    SchedRun(sched);

    /* only first task should have fired*/
    ASSERT_EQ(suite, 1, counter);
    ASSERT_EQ(suite, 3, SchedSize(sched));
    ASSERT_FALSE(suite, SchedIsEmpty(sched));

    SchedDestroy(sched);
    PRINT_SUITE_SUMMARY(suite);
}

/* --------------------------------------------------------------------- */
static void Test_StressManyTasks(void)
{
    INIT_SUITE(suite, "Stress 10K tasks");

    size_t tasks_amount = 10000;

    sched_t* sched = SchedCreate();
    time_t now = time(NULL);
    size_t counter = 0;
    size_t i = 0;

    TEST_CASE("Stress 10K tasks all with the same time");
    for (i = 0; tasks_amount > i; ++i)
    {
        SchedAdd(sched, CbIncCounter, CleanupVoid, &counter, now);
    }
    ASSERT_EQ(suite, tasks_amount, SchedSize(sched));

    SchedRun(sched);

    ASSERT_EQ(suite, tasks_amount, counter);
    ASSERT_TRUE(suite, SchedIsEmpty(sched));

    SchedDestroy(sched);
    PRINT_SUITE_SUMMARY(suite);
}
/************************************************************************* */
static void Test_SelfRemove(void)
{
    INIT_SUITE(suite, "Self remove");

    sched_t* sched = SchedCreate();
    time_t now = time(NULL);
    int counter = 0;
    ilrd_uid_t uid = UIDBadUID;
    repeat_with_uid_t ctx = {
        0,
    };

    ctx.sched = sched;
    ctx.counter = &counter;
    ctx.limit = 3;

    /* repeating- scheduler removes itself after 3rd fire*/
    TEST_CASE("Add repeating task with self remove");

    uid = SchedAdd(sched, CbRepeatWithRemove, CleanupVoid, &ctx, now);
    ctx.uid = &uid;
    ASSERT_FALSE(suite, UIDIsSame(UIDBadUID, *ctx.uid));
    ASSERT_EQ(suite, 1, SchedSize(sched));

    SchedRun(sched);
    ASSERT_EQ(suite, 3, counter); /* fired exactly 3 times */
    SHOW_INT(counter);
    ASSERT_TRUE(suite, SchedIsEmpty(sched));

    SchedDestroy(sched);
    PRINT_SUITE_SUMMARY(suite);
}
/*---------------------------------------------------------------------*/

static void Test_RemoveOtherInsideCallback(void)
{
    INIT_SUITE(suite, "Remove other task inside callback");

    sched_t* sched = SchedCreate();
    time_t now = time(NULL);

    int victim_counter = 0;
    int removed_flag = 0;

    remove_ctx_t ctx = {
        0,
    };

    ilrd_uid_t victim_uid =
        SchedAdd(sched, CbIncCounter, CleanupVoid, &victim_counter, now + 2);

    ctx.sched = sched;
    ctx.victim_uid = victim_uid;
    ctx.removed_flag = &removed_flag;

    SchedAdd(sched, CbRemoveOtherInside, CleanupVoid, &ctx, now);
    SchedRun(sched);

    ASSERT_EQ(suite, 1, removed_flag);   /* killer executed */
    ASSERT_EQ(suite, 0, victim_counter); /* victim never fired  */
    ASSERT_TRUE(suite, SchedIsEmpty(sched));

    SchedDestroy(sched);
    PRINT_SUITE_SUMMARY(suite);
}
/* --------------------------------------------------------------------- */
static void Test_AddInsideCallback(void)
{
    INIT_SUITE(suite, "Add inside callback");

    sched_t* sched = SchedCreate();
    time_t now = time(NULL);
    add_ctx_t ctx = {
        0,
    };
    int first_ctr = 0;
    int second_ctr = 0;

    ctx.sched = sched;
    ctx.first_ctr = &first_ctr;
    ctx.second_ctr = &second_ctr;

    SchedAdd(sched, CbAddTaskInside, CleanupVoid, &ctx, now);

    SchedRun(sched);

    ASSERT_EQ(suite, 1, first_ctr);
    ASSERT_EQ(suite, 1, second_ctr);
    ASSERT_TRUE(suite, SchedIsEmpty(sched));

    SchedDestroy(sched);
    PRINT_SUITE_SUMMARY(suite);
}
/************************************************************************* */
static void Test_AddTaskInterleaving(void)
{

    INIT_SUITE(suite, "Add task interleaving (PingPong)");
    sched_t* sched = SchedCreate();
    time_t now = time(NULL);
    interleaving_ctx_t ctx = {
        0,
    };
    int counter = 0;

    ctx.sched = sched;
    ctx.counter = &counter;

    TEST_CASE("Add task interleaving with another task inside");
    SchedAdd(sched, CbAddTaskInterleaving1, CleanupVoid, &ctx, now);

    SchedRun(sched);
    ASSERT_EQ(suite, 20, counter);

    SHOW_INT(counter);
    ASSERT_TRUE(suite, SchedIsEmpty(sched));
    SHOW_SIZET(SchedSize(sched));

    SchedDestroy(sched);
    PRINT_SUITE_SUMMARY(suite);
}

/*---------------------------------------------------------------------*/

static void Test_ClearInsideCallback(void)
{
    INIT_SUITE(suite, "Clear + Size inside callback");

    sched_t* sched = SchedCreate();
    time_t now = time(NULL);

    size_t size_in_cb = 666; /* impossible*/
    int never_runs = 0;

    clear_ctx_t ctx = {
        0,
    };
    ctx.sched = sched;
    ctx.size_inside = &size_in_cb;

    /* first task clears everything immediately */
    SchedAdd(sched, CbClearInside, CleanupVoid, &ctx, now);

    /* second tasks should be wiped before its time arrives */
    SchedAdd(sched, CbIncCounter, CleanupVoid, &never_runs, now + 1);
    SchedAdd(sched, CbIncCounter, CleanupVoid, &never_runs, now + 1);
    SchedAdd(sched, CbIncCounter, CleanupVoid, &never_runs, now + 1);

    SchedRun(sched);

    ASSERT_EQ(suite, 0, size_in_cb);
    ASSERT_EQ(suite, 0, never_runs);
    ASSERT_TRUE(suite, SchedIsEmpty(sched));

    SchedDestroy(sched);
    PRINT_SUITE_SUMMARY(suite);
}

/************************************************************************* */
#define NUM_ORDERS (3)
static void Test_FIFOSamePriority(void)
{
    INIT_SUITE(suite, "FIFO same priority");

    sched_t* sched = SchedCreate();
    time_t now = time(NULL) + 1;
    int i = 0;
    int j = 0;
    int result_order[3] = {0};
    int expected_order[3] = {1, 2, 3};
    size_t idx = 0;
    order_t orders[NUM_ORDERS] = {0};

    
    for (i = 0; i < NUM_ORDERS; ++i)
    {

        orders[i].out_arr = result_order;
        orders[i].idx = &idx;
        orders[i].val = i + 1;
    }
    /* enqueue with same time */
    for (i = 0; i < NUM_ORDERS; ++i)
    {
        SchedAdd(sched, CbCollectOrder, CleanupVoid, &orders[i], now+5);
        j = i*3 + 1;
        
        while(--j)
        {
            SchedAdd(sched,DummyTask, CleanupVoid, NULL, now+j);
        }
    }

    SchedRun(sched);

    /* verify FIFO  */
    ASSERT_MEM_EQ(suite, result_order, expected_order, sizeof(result_order));
    ASSERT_TRUE(suite, SchedIsEmpty(sched));

    SchedDestroy(sched);
    PRINT_SUITE_SUMMARY(suite);
}

/************************SLDbgi ANIMATION********************************* */
/* */
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
    REGISTER_TEST(Test_SizeEmptyAdd);
    REGISTER_TEST(Test_AddRunSingle);
    REGISTER_TEST(Test_AddMultipleOrder);
    REGISTER_TEST(Test_Remove);
    REGISTER_TEST(Test_Clear);
    REGISTER_TEST(Test_Repeating);
    REGISTER_TEST(Test_Stop);
    REGISTER_TEST(Test_StressManyTasks);
    REGISTER_TEST(Test_SelfRemove);
    REGISTER_TEST(Test_RemoveOtherInsideCallback);
    REGISTER_TEST(Test_AddInsideCallback);
    REGISTER_TEST(Test_AddTaskInterleaving);
    REGISTER_TEST(Test_ClearInsideCallback);
    REGISTER_TEST(Test_FIFOSamePriority);
}
