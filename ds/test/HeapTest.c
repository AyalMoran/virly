/**************************************************************
 * File    : HeapTest.c
 * Author  : Ayal Moran
 * Reviewer: 
 * Date    : 06-12-2025
**************************************************************/
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>

#include "Heap.h"
#include "test_utils.h"

#define NUM_ELEMENTS (20)

static void RegisterTests(void);

static int IntCmp(const void* lhs, const void* rhs)
{
    int l = *(const int*)lhs;
    int r = *(const int*)rhs;

    return (l > r) - (l < r);
}

static int IsMatchInt(const void * data, void * param)
{
    return (*(const int *)data == *(int *)param);
}

static void PrintVector(const heap_t* heap)
{
    size_t i    = 0;
    size_t size = HeapSize(heap);

    printf("Heap contents: ");
    for (i = 0; i < size; ++i)
    {
        printf("%d ", *(int*) HeapPeekAtIndex(heap, i));
    }
    printf("\n");
}

/*
 * Primary Functions Tests*/
static void Test_Create(void)
{
    INIT_SUITE(create, "CREATE");

    heap_t* heap = HeapCreate(IntCmp);

    RUN_TEST(create, "Create returns non-NULL", heap != NULL);

    HeapDestroy(heap);

    printf("== [%s] %d/%d Passed ==\n", create.name, create.passed,
           create.total);
}

static void Test_Insert(void)
{
    INIT_SUITE(insert, "INSERT");

    heap_t* heap = HeapCreate(IntCmp);
    int vals[15];
    size_t i = 0;
    int j = 9999;
    for (i = 0; i < 15; ++i)
    {
        vals[i] = (int) i + 1;
    }

    for (i = 0; i < 10; ++i)
    {
        char desc[64];
        sprintf(desc, "Insert %d", vals[i]);
        RUN_TEST(insert, desc, HeapPush(heap, &vals[i]) == 0);

        sprintf(desc, "Heap size is %lu", (unsigned long) (i + 1));
        RUN_TEST(insert, desc, HeapSize(heap) == (size_t) (i + 1));

        sprintf(desc, "Peek is %d", vals[i]);
        RUN_TEST(insert, desc, *(int*) HeapPeek(heap) == vals[i]);
    }

    RUN_TEST(insert, "Insert 0", HeapPush(heap, &vals[0]) == 0);
    RUN_TEST(insert, "Heap size is 11", HeapSize(heap) == 11);
    RUN_TEST(insert, "Peek still max (10)", *(int*) HeapPeek(heap) == 10);

    vals[11] = 100;
    RUN_TEST(insert, "Insert 100", HeapPush(heap, &vals[11]) == 0);
    RUN_TEST(insert, "Heap size is 12", HeapSize(heap) == 12);
    RUN_TEST(insert, "Peek is now 100", *(int*) HeapPeek(heap) == 100);

    vals[12] = 100;
    RUN_TEST(insert, "Insert duplicate max (100)",
             HeapPush(heap, &vals[12]) == 0);
    RUN_TEST(insert, "Heap size is 13", HeapSize(heap) == 13);
    RUN_TEST(insert, "Peek still 100", *(int*) HeapPeek(heap) == 100);

    for (i = 14; i >= 13; --i)
    {
        char desc[64];
        vals[i] = (int) (14 - i);
        sprintf(desc, "Insert descending %d", vals[i]);
        RUN_TEST(insert, desc, HeapPush(heap, &vals[i]) == 0);
    }

    RUN_TEST(insert, "Heap size is 15", HeapSize(heap) == 15);
    RUN_TEST(insert, "Peek still 100", *(int*) HeapPeek(heap) == 100);

    RUN_TEST(insert, "Insert invalid value (9999)", HeapPush(heap, &j) == 0);
    RUN_TEST(insert, "Heap size is 16", HeapSize(heap) == 16);
    RUN_TEST(insert, "Peek is now 9999", *(int*) HeapPeek(heap) == 9999);


    PrintVector(heap);

    HeapDestroy(heap);
    printf("== [%s] %d/%d Passed ==\n", insert.name, insert.passed,
           insert.total);
}
static void Test_Remove(void)
{
    INIT_SUITE(remove, "REMOVE");

    heap_t * heap      = HeapCreate(IntCmp);
    int      vals[20]  = {0};
    size_t   i         = 0;
    int      param     = 0;
    void   * ret_ptr   = NULL;

    for (i = 0; i < 15; ++i)
    {
        vals[i] = (int)i + 1;
        HeapPush(heap, &vals[i]);
    }

    RUN_TEST(remove, "Heap size 15 after inserts", 15 == HeapSize(heap));
    RUN_TEST(remove, "Peek is 15",                15 == *(int *)HeapPeek(heap));

    param   = 15;
    ret_ptr = HeapRemove(heap, IsMatchInt, &param);

    RUN_TEST(remove, "Remove root returns ptr",   NULL != ret_ptr);
    RUN_TEST(remove, "Returned value is 15",      15   == *(int *)ret_ptr);
    RUN_TEST(remove, "Size 14 after root remove", 14   == HeapSize(heap));
    RUN_TEST(remove, "New peek is 14",            14   == *(int *)HeapPeek(heap));

    param   = 7;
    ret_ptr = HeapRemove(heap, IsMatchInt, &param);

    RUN_TEST(remove, "Remove middle returns ptr", NULL != ret_ptr);
    RUN_TEST(remove, "Returned value is 7",       7    == *(int *)ret_ptr);
    RUN_TEST(remove, "Size 13 after remove 7",    13   == HeapSize(heap));
    RUN_TEST(remove, "Peek still 14",             14   == *(int *)HeapPeek(heap));

    param   = 99;
    ret_ptr = HeapRemove(heap, IsMatchInt, &param);

    RUN_TEST(remove, "Remove missing returns NULL", NULL == ret_ptr);
    RUN_TEST(remove, "Size unchanged (13)",        13   == HeapSize(heap));
    RUN_TEST(remove, "Peek unchanged (14)",        14   == *(int *)HeapPeek(heap));

    vals[15] = 10;
    vals[16] = 10;
    HeapPush(heap, &vals[15]);
    HeapPush(heap, &vals[16]);

    RUN_TEST(remove, "Size 15 after pushing dups", 15 == HeapSize(heap));

    param   = 10;
    ret_ptr = HeapRemove(heap, IsMatchInt, &param);

    RUN_TEST(remove, "Remove first 10 returns ptr", NULL != ret_ptr);
    RUN_TEST(remove, "Returned value is 10",        10   == *(int *)ret_ptr);
    RUN_TEST(remove, "Size 14 after first dup",     14   == HeapSize(heap));

    param   = 10;
    ret_ptr = HeapRemove(heap, IsMatchInt, &param);

    RUN_TEST(remove, "Remove second 10 returns ptr", NULL != ret_ptr);
    RUN_TEST(remove, "Returned value is 10",         10   == *(int *)ret_ptr);
    RUN_TEST(remove, "Size 13 after second dup",     13   == HeapSize(heap));

    HeapDestroy(heap);

    PRINT_SUITE_SUMMARY(remove);
}


static void Test_HeapPop(void)
{
    INIT_SUITE(pop, "HEAP POP");

    heap_t* heap = HeapCreate(IntCmp);
    int vals[10];
    size_t i      = 0;
    int*   peeked = NULL;

    for (i = 0; i < 10; ++i)
    {
        vals[i] = (int) (i + 1); /* Fill with 1..10 */
        HeapPush(heap, &vals[i]);
    }

    RUN_TEST(pop, "Heap size is 10 after insertions", HeapSize(heap) == 10);
    RUN_TEST(pop, "Peek returns max (10)", *(int*) HeapPeek(heap) == 10);

    /* Pop elements and check max order */
    for (i = 0; i < 10; ++i)
    {
        int expected = 10 - i;
        char desc1[64], desc2[64];
        
        peeked = (int*) HeapPeek(heap);
        printf("heap in iteration %lu: ", i + 1);
        PrintVector(heap);

        sprintf(desc1, "Peek is %ld before pop", (long) expected);
        sprintf(desc2, "Size after pop is %lu", (unsigned long) (9 - i));

        RUN_TEST(pop, desc1, NULL != peeked && *peeked == expected);

        HeapPop(heap);

        RUN_TEST(pop, desc2, HeapSize(heap) == (size_t) (9 - i));
    }

    RUN_TEST(pop, "Heap is empty", HeapIsEmpty(heap));

    HeapDestroy(heap);

    printf("== [%s] %d/%d Passed ==\n", pop.name, pop.passed, pop.total);
}

static void Test_HeapPop_Random(void)
{
    INIT_SUITE(pop_rand, "HEAP POP - RANDOM");

    heap_t *heap = HeapCreate(IntCmp);
    int     vals[NUM_ELEMENTS];
    size_t  i        = 0;
    int prev_max = 0;
    int   *peeked    = NULL;

    srand(42);
    for (i = 0; i < NUM_ELEMENTS; ++i)
    {
        vals[i] = (rand() % 100) + 1;
        HeapPush(heap, &vals[i]);
    }

    RUN_TEST(pop_rand, "Heap size is 20", HeapSize(heap) == NUM_ELEMENTS);

    prev_max = 101;

    for (i = 0; i < NUM_ELEMENTS; ++i)
    {
        char desc1[64];
        char desc2[64];

        peeked = (int *)HeapPeek(heap);

        sprintf(desc1, "Peek is not NULL (iteration %lu)", (unsigned long)i);

        RUN_TEST(pop_rand, desc1, NULL != peeked);

        if (NULL != peeked)
        {
            sprintf(desc2, "Peek <= previous max (%d <= %ld)", *peeked, (long)prev_max);

            RUN_TEST(pop_rand, desc2, *peeked <= prev_max);
            prev_max = *peeked;
        }

        HeapPop(heap);
    }

    RUN_TEST(pop_rand, "Heap is empty after all pops", HeapIsEmpty(heap));
    
    HeapDestroy(heap);

    printf("== [%s] %d/%d Passed ==\n", pop_rand.name, pop_rand.passed, pop_rand.total);
}

int main(void)
{
    int i = 0;

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
    REGISTER_TEST(Test_HeapPop);
    REGISTER_TEST(Test_HeapPop_Random);
    REGISTER_TEST(Test_Remove);
}
