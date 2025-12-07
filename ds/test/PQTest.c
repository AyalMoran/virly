/******************
 Author  : Ayal Moran
 Reviewer: Or Oved
 Date    : 23.4.25
 *****************/
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include <unistd.h>
#include <graphics.h> 
#include <math.h>
#include <time.h> 

#define PI (3.14159265)

#include "PQ.h"

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
static size_t test_count = 0;

/*output and colors*/
/* General Formatting */
#define RESET                    (0)
#define BRIGHT                   (1)
#define DIM                      (2)
#define ITALICS              	 (3)
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
        printf("=====STARTING %s TESTS=====\n", name);	\
        printf("================================\n");                \
		SET_PRINT_COLOR(RESET);							\
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
        SET_PRINT_COLOR(BG_YELLOW); \
        SET_PRINT_COLOR(ITALICS); \
        printf("\n========== BEGIN SUITE: %s ==========", name); \
        SET_PRINT_COLOR(RESET); \
        printf("\n"); \
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


#define REGISTER_TEST(funct)                          \
    do {                                              \
        if (test_count < MAX_TESTS) {                \
            test_registry[test_count].name = #funct;  \
            test_registry[test_count].func = funct;   \
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

static int IntCmp(const void *data1, const void *data2)
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

static int IsMatchEq(const void *data, void *param)
{
    return *((const int*) data) == *((const int*) param);
}

static void Test_CreateDestroy(void)
{
    INIT_SUITE(suite, "Create/Destroy");

    pq_t* pq = PQCreate(IntCmp);
    ASSERT_NOT_NULL(suite, pq);

    PQDestroy(pq);            
    ASSERT_TRUE(suite, 1);  

    PRINT_SUITE_SUMMARY(suite);
}

/* ------------------------------------------------------------------------- */

static void Test_EnqueueDequeueOrd(void)
{
    INIT_SUITE(EnqDeqSuite, "Ordering");

    pq_t* pq      = PQCreate(IntCmp);
    int   arr[5] = {3, 1, 4, 5, 2};
    int   exp[5] = {5, 4, 3, 2, 1};      /* dequeue order       */
    int   idx    = 0;

    for (idx = 0; 5 > idx; ++idx)
    {
        ASSERT_EQ(EnqDeqSuite, 0, PQEnqueue(pq, &arr[idx]));
    }

    for (idx = 0; 5 > idx; ++idx)
    {
        int* p = (int *)PQDequeue(pq);   /* pops from the back  */
        ASSERT_EQ(EnqDeqSuite, exp[idx], *p);
    }

    ASSERT_TRUE(EnqDeqSuite, PQIsEmpty(pq));

    PQDestroy(pq);
    PRINT_SUITE_SUMMARY(EnqDeqSuite);
}

/* ------------------------------------------------------------------------- */

static void Test_Peek(void)
{
    INIT_SUITE(suite, "Peek (back element)");

    pq_t* pq = PQCreate(IntCmp);

    /* enqueue and ensure Peek does not remove */
    {
        int x = 7;
        PQEnqueue(pq, &x); /* 7 is now at the back  */
        ASSERT_EQ(suite, 7, *((int*) PQPeek(pq)));
        ASSERT_FALSE(suite, PQIsEmpty(pq));
    }

    PQDestroy(pq);
    PRINT_SUITE_SUMMARY(suite);
}

/* ------------------------------------------------------------------------- */

static void Test_SizeIsEmpty(void)
{
    INIT_SUITE(suite, "Size & IsEmpty");

    pq_t* pq = PQCreate(IntCmp);
    ASSERT_TRUE(suite, PQIsEmpty(pq));
    ASSERT_EQ(suite, 0, PQSize(pq));

    {
        int x = 42;
        PQEnqueue(pq, &x);
        ASSERT_FALSE(suite, PQIsEmpty(pq));
        ASSERT_EQ(suite, 1, PQSize(pq));
    }

    PQDequeue(pq);
    ASSERT_TRUE(suite, PQIsEmpty(pq));
    ASSERT_EQ(suite, 0, PQSize(pq));

    PQDestroy(pq);
    PRINT_SUITE_SUMMARY(suite);
}

/* ------------------------------------------------------------------------- */

static void Test_Clear(void)
{
    INIT_SUITE(suite, "Clear");

    pq_t* pq = PQCreate(IntCmp);
    {
        int a = 1;
        int b = 2;
        int c = 3;
        PQEnqueue(pq, &a);
        PQEnqueue(pq, &b);
        PQEnqueue(pq, &c);
    }

    PQClear(pq);
    ASSERT_TRUE(suite, PQIsEmpty(pq));
    ASSERT_EQ(suite, 0, PQSize(pq));

    PQDestroy(pq);
    PRINT_SUITE_SUMMARY(suite);
}

/* ------------------------------------------------------------------------- */

static void Test_EraseSingle(void)
{
    INIT_SUITE(suite, "Erase single");

    pq_t* pq = PQCreate(IntCmp);
    {
        int a = 10;
        int b = 20;
        int c = 30;
        PQEnqueue(pq, &a);   /* 10 */
        PQEnqueue(pq, &b);   /* 10 20 */
        PQEnqueue(pq, &c);   /* 10 20 30 */

        /* remove the middle element (20) */
        {
            int match = 20;
            int* ret  = (int*) PQErase(pq, IsMatchEq, &match);
            ASSERT_EQ(suite, 20, *ret);
        }

        /* dequeue order: highest at back -> 30 then 10 */
        {
            int* p = (int *)PQDequeue(pq);   /* 30 */
            ASSERT_EQ(suite, 30, *p);
            p = (int *)PQDequeue(pq);        /* 10 */
            ASSERT_EQ(suite, 10, *p);
        }
    }

    PQDestroy(pq);
    PRINT_SUITE_SUMMARY(suite);
}

/* ------------------------------------------------------------------------- */

static void Test_EraseMultiple(void)
{
    INIT_SUITE(suite, "Erase multiple (first match rule)");

    pq_t* pq = PQCreate(IntCmp);
    {
        int a = 5;
        int b = 5;
        int c = 5;
        
        PQEnqueue(pq, &a);  /* a in */
        PQEnqueue(pq, &b);  /* b after a (FIFO among equals) */
        PQEnqueue(pq, &c);  /* c after b                    */

        {
            int match = 5;
            int* ret  = (int*) PQErase(pq, IsMatchEq, &match);
            ASSERT_EQ(suite, 5, *ret);   /* first (a) removed */
            ASSERT_EQ(suite, 2, PQSize(pq));
        }
    }

    PQDestroy(pq);
    PRINT_SUITE_SUMMARY(suite);
}

/* ------------------------------------------------------------------------- */

static void Test_EraseNoMatch(void)
{
    INIT_SUITE(suite, "Erase no-match");

    pq_t* pq = PQCreate(IntCmp);
    {
        int x = 1;
        PQEnqueue(pq, &x);

        {
            int match = 99;
            ASSERT_NULL(suite, PQErase(pq, IsMatchEq, &match));
        }
        ASSERT_EQ(suite, 1, PQSize(pq));
    }

    PQDestroy(pq);
    PRINT_SUITE_SUMMARY(suite);
}

/* ------------------------------------------------------------------------- */

static void Test_PingPong(void)
{
    INIT_SUITE(suite, "PingPong operations");

    pq_t* pq = PQCreate(IntCmp);
    {
        int a = 4, b = 1, c = 3, d = 2;

        PQEnqueue(pq, &a);                      /* list: 4 */
        ASSERT_EQ(suite, 4, *((int *)PQPeek(pq)));

        PQEnqueue(pq, &b);                      /* 1 4 */
        PQEnqueue(pq, &c);                      /* 1 3 4 */

        ASSERT_EQ(suite, 4, *((int *)PQDequeue(pq)));   /* pop 4 -> 1 3    */
        PQEnqueue(pq, &d);                      /* 1 2 3  */

        {
            int exp[3] = {3, 2, 1};
            int k      = 0;

            for (k = 0; 3 > k; ++k)
            {
                int* p = (int*) PQDequeue(pq);
                ASSERT_EQ(suite, exp[k], *p);
            }
        }
        ASSERT_TRUE(suite, PQIsEmpty(pq));
    }

    PQDestroy(pq);
    PRINT_SUITE_SUMMARY(suite);
}

/* ------------------------------------------------------------------------- */

static void Test_EnqueueNULL(void)
{
    INIT_SUITE(suite, "Enqueue NULL pointer");

    pq_t* pq = PQCreate(IntCmp);

    ASSERT_EQ(suite, 0, PQEnqueue(pq, NULL));
    ASSERT_NULL(suite, PQPeek(pq));   /* NULL = lowest*/

    ASSERT_NULL(suite, PQDequeue(pq));
    ASSERT_TRUE(suite, PQIsEmpty(pq));

    PQDestroy(pq);
    PRINT_SUITE_SUMMARY(suite);
}

/* ------------------------------------------------------------------------- */

static void Test_Stress10(void)
{
    INIT_SUITE(suite, "Stress-10 elements");

    {
        pq_t* pq 	= PQCreate(IntCmp);
        int* arr 	= (int*) malloc(10 * sizeof(int));
        int   idx 	= 0;

        if (NULL == arr)
        {
            printf("malloc failed\n");
            exit(1);
        }

        /* enqueue 0..9  ->  list: 0 1 2 ... 9 (9 at the back) */
        for (idx = 0; 10 > idx; ++idx)
        {
            arr[idx] = idx;
            PQEnqueue(pq, &arr[idx]);
        }
        ASSERT_EQ(suite, 10, PQSize(pq));

        /* dequeue must give 9..0 */
        for (idx = 9; 0 <= idx; --idx)
        {
            int* p = (int *)PQDequeue(pq);
            ASSERT_EQ(suite, idx, *p);
        }

        free(arr);
        PQDestroy(pq);
    }

    PRINT_SUITE_SUMMARY(suite);
}

/* ------------------------------------------------------------------------- */

static void Test_StressStability(void)
{
    INIT_SUITE(suite, "Stability – identical FIFO");

    {
        pq_t* pq = PQCreate(IntCmp);
        
        int x = 9;
        int a = 10;
        int b = 10;
        int c = 10;
        int y = 11;
        
        PQEnqueue(pq, &a);  
        PQEnqueue(pq, &x);  
        PQEnqueue(pq, &b);   
        PQEnqueue(pq, &y);  
        PQEnqueue(pq, &c);   

        /* first-in first-out*/
        ASSERT_TRUE(suite, (&y) == PQDequeue(pq));
        ASSERT_TRUE(suite, (&a) == PQDequeue(pq));
        ASSERT_TRUE(suite, (&b) == PQDequeue(pq));
        ASSERT_TRUE(suite, (&c) == PQDequeue(pq));
        ASSERT_TRUE(suite, (&x) == PQDequeue(pq));

        PQDestroy(pq);
    }

    PRINT_SUITE_SUMMARY(suite);
}

/* ------------------------------------------------------------------------- */

static void Test_DestroyNonEmpty(void)
{
    INIT_SUITE(suite, "Destroy non-empty queue");

    {
        pq_t* pq = PQCreate(IntCmp);
        {
            int x = 1;
            PQEnqueue(pq, &x);
        }

        PQDestroy(pq);
        ASSERT_TRUE(suite, 1);
    }

    PRINT_SUITE_SUMMARY(suite);
}
/* function for printing */
/* message as colored character */
/*
void PrintMsg(char* msg)
{
    int gd = DETECT;
    int gm = 0;
    int i  = 6;

    initgraph(&gd, &gm, "");  
       
    setcolor(i);
    settextstyle(6, 0, 6);
    outtextxy(100, 20 * i, msg);
    sleep(5);                   
    

    closegraph();
}

void PrintAllTestsPassed(void)
{
    int gd = DETECT;
    int gm = 0;
    int frame = 0;
    int x_pos = 0;
    int y_pos = 0;
    int colour1 = 0;
    int colour2 = 0;
    int i = 0;

    srand((unsigned)time(NULL));

    initgraph(&gd, &gm, "");   
    setbkcolor(BLACK);
    cleardevice();

    /* ----- wave animation loop -------------------------------- */
    /* for (frame = 0; 200 > frame; ++frame)         
        cleardevice();                           

        x_pos = 150;                              
        y_pos = 220 + (int)(40.0 * sin(frame * PI / 25.0));
        colour1 = (frame % 15) + 1;              

        setcolor(colour1);
        settextstyle(TRIPLEX_FONT, 0, 4);         
        outtextxy(x_pos, y_pos, "YAY! ALL TESTS HAVE PASSED!");

		colour2 = (rand() % 15) + 1;
        setcolor(colour2);
        putpixel(rand() % getmaxx(), rand() % getmaxy(), colour2);

        delay(50);                                
    } */

    /* ----- confetti burst ------------------------------------- */
   /*  for (i = 0; 10000 > i; ++i)
    {
        colour2 = (rand() % 15) + 1;
        setcolor(colour2);
        putpixel(rand() % getmaxx(), rand() % getmaxy(), colour2);
        delay(2);
    }

    getchar();
    closegraph();   */                                /* cleanup    */
/*}*/
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

    /*PRINT_SUMMARY();
    if(passed_tests == total_tests)
    {
	    PrintAllTestsPassed();
    }*/
    PRINT_SUMMARY();
    return 0;
}

static void RegisterTests(void)
{
    REGISTER_TEST(Test_CreateDestroy);
    REGISTER_TEST(Test_EnqueueDequeueOrd);
    REGISTER_TEST(Test_Peek);
    REGISTER_TEST(Test_SizeIsEmpty);
    REGISTER_TEST(Test_Clear);
    REGISTER_TEST(Test_EraseSingle);
    REGISTER_TEST(Test_EraseMultiple);
    REGISTER_TEST(Test_EraseNoMatch);
    REGISTER_TEST(Test_PingPong);
    REGISTER_TEST(Test_EnqueueNULL);
    REGISTER_TEST(Test_Stress10);
    REGISTER_TEST(Test_StressStability);
    REGISTER_TEST(Test_DestroyNonEmpty);
}

