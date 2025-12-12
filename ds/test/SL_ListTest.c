#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "SL_List.h" 

#define RUN_TEST(desc, expr)                           \
    do {                                               \
        ++total_tests;                                 \
        if (expr) {                                    \
            ++passed_tests;                            \
            printf("[PASS] %s\n", desc);               \
        } else {                                       \
            printf("[FAIL] %s\n", desc);               \
        }                                              \
    } while (0)

int total_tests = 0;
int passed_tests = 0;

int MatchInt(const void *data, void *param)
{
    return (*(int *)data == *(int *)param);
}

int IncrementInt(void *data, void *param)
{
    (void)param;
    ++(*(int *)data);
    return 0;
}

int CountInts(void *data, void *param)
{
    (void)data;
    ++(*(int *)param);
    return 0;
}

int StopAtValue(void *data, void *param)
{
    int stop_value = *(int *)param;
    if (*(int *)data == stop_value)
    {
        return 1; 
    }
    return 0;
}


void PrintList(const char* msg, sll_t *list)
{
    sll_iter_t iter = SLLBegin(list);
    printf("%s: ", msg);
    while (!SLLIterIsEqual(iter, SLLEnd(list)))
    {
        printf("%d ", *(int *)SLLGetData(iter));
        iter = SLLNext(iter);
    }
    printf("\n");
}

int main(void)
{
    sll_t *list = NULL;
    sll_iter_t iter = NULL;
    sll_iter_t found = NULL;
    int a = 10, b = 20, c = 30, d = 40, e = 50;
    int target = 0;
    int counter = 0;
    int result = 0;

    printf("=== Starting Tests ===\n");

    list = SLLCreate();
    RUN_TEST("SLLCreate returns non-NULL", list != NULL);
    RUN_TEST("SLLIsEmpty after creation", SLLIsEmpty(list) == 1);
    RUN_TEST("SLLCount is 0 on empty list", SLLCount(list) == 0);

    iter = SLLBegin(list);
    iter = SLLInsert(iter, &a);
    RUN_TEST("SLLIsEmpty returns false after one insert", SLLIsEmpty(list) == 0);
    RUN_TEST("SLLCount returns 1 after one insert", SLLCount(list) == 1);
    RUN_TEST("First element equals 10", *(int *)SLLGetData(SLLBegin(list)) == 10);

    SLLSetData(SLLBegin(list), &b);
    RUN_TEST("SLLSetData modifies first element to 20", *(int *)SLLGetData(SLLBegin(list)) == 20);

    iter = SLLBegin(list);
    iter = SLLInsert(iter, &c); 
    RUN_TEST("SLLCount returns 2 after second insert", SLLCount(list) == 2);
    RUN_TEST("First element equals 30", *(int *)SLLGetData(SLLBegin(list)) == 30);

    iter = SLLEnd(list);
    iter = SLLInsert(iter, &d);  /* List becomes: 30, 20, 40 */
    RUN_TEST("SLLCount returns 3 after third insert", SLLCount(list) == 3);

    iter = SLLNext(SLLBegin(list));
    iter = SLLInsert(iter, &e);  /* List becomes: 30, 50, 20, 40 */
    RUN_TEST("SLLCount returns 4 after fourth insert", SLLCount(list) == 4);

    PrintList("Current list", list);

    target = 20;
    found = SLLFind(SLLBegin(list), SLLEnd(list), MatchInt, &target);
    RUN_TEST("SLLFind found element 20", 
             !SLLIterIsEqual(found, SLLEnd(list)) && (*(int *)SLLGetData(found) == 20));

    target = 999;  
    found = SLLFind(SLLBegin(list), SLLEnd(list), MatchInt, &target);
    RUN_TEST("SLLFind returns end when element not found", SLLIterIsEqual(found, SLLEnd(list)));

    target = 20; 
    result = SLLForEach(SLLBegin(list), SLLEnd(list), StopAtValue, &target);
    RUN_TEST("SLLForEach stops early when value is found", result != 0);

    result = SLLForEach(SLLBegin(list), SLLEnd(list), IncrementInt, NULL);
    RUN_TEST("SLLForEach returns 0 when iterating all elements", result == 0);

    RUN_TEST("First element incremented correctly", *(int *)SLLGetData(SLLBegin(list)) == 31);

    counter = 0;
    SLLForEach(SLLBegin(list), SLLEnd(list), CountInts, &counter);
    RUN_TEST("SLLForEach counted 4 elements", counter == 4);
 
    iter = SLLBegin(list);
    SLLRemove(iter);
    RUN_TEST("SLLCount is 3 after removing first element", SLLCount(list) == 3);
    PrintList("List after removing first element", list);

    iter = SLLNext(SLLBegin(list));
    SLLRemove(iter);
    RUN_TEST("SLLCount is 2 after removing a middle element", SLLCount(list) == 2);
    PrintList("List after removing middle element", list);

    iter = SLLBegin(list);
    iter = SLLNext(iter); 
    SLLRemove(iter);
    RUN_TEST("SLLCount is 1 after removing last element", SLLCount(list) == 1);
    PrintList("List after removing last element", list);

    /*iter = SLLEnd(list);
    found = SLLRemove(iter);
    RUN_TEST("SLLRemove on dummy tail returns NULL", found == NULL);*/

    iter = SLLBegin(list);
    SLLRemove(iter);
    RUN_TEST("SLLCount is 0 after removing the final element", SLLCount(list) == 0);
    RUN_TEST("SLLIsEmpty returns true when list is empty", SLLIsEmpty(list) == 1);

    result = SLLForEach(SLLBegin(list), SLLEnd(list), IncrementInt, NULL);
    RUN_TEST("SLLForEach on empty list returns 0", result == 0);

    iter = SLLBegin(list);
    iter = SLLInsert(iter, &a);
    RUN_TEST("After re-insert, SLLCount returns 1", SLLCount(list) == 1);
    PrintList("List after re-insert", list);

    {
        int nums[] = {100, 200, 300, 400, 500};
        int i;

        for (i = 0; i < 5; ++i)
        {
            iter = SLLBegin(list);
            SLLInsert(iter, &nums[i]);
        }
        RUN_TEST("SLLCount returns 6 after chained inserts", SLLCount(list) == 6);
        PrintList("List after chained inserts", list);
        i = 1;
        while (!SLLIsEmpty(list))
        {
            printf("Removing: iteration number %d\n", i);
            printf("==========================\n");

            SLLRemove(SLLBegin(list));
            PrintList("List after chained remove", list);
            printf("==========================\n");

            ++i;
        }
        RUN_TEST("SLLCount returns 0 after removing all elements", SLLCount(list) == 0);
    }
	
	{
		int aa = 10, bb = 20, cc = 30, dd = 40, ee = 50;
	    sll_t* list2 = NULL;
	    sll_t* list3 = NULL;
	    
	    list2 = SLLCreate();
	    list3 = SLLCreate();
	    
		SLLInsert(SLLEnd(list2),&aa);
		SLLInsert(SLLEnd(list2),&bb);
		SLLInsert(SLLEnd(list2),&cc);
		
		SLLInsert(SLLEnd(list3),&dd);
		SLLInsert(SLLEnd(list3),&ee);
		
        RUN_TEST("SLLAppend: SLLCount of list2 returns 3 before appending ",
				SLLCount(list2) == 3);
        RUN_TEST("SLLAppend: SLLCount of list3 returns 2 before appending ",					
				SLLCount(list3) == 2);
		
		SLLAppend(list2, list3);
		
		RUN_TEST("SLLAppend: SLLCount of list2 returns 5 after appending ",					
				SLLCount(list2) == 5);

        PrintList("List2 after chained appending", list2);
        
		SLLDestroy(list2);

        
	}

	


    SLLDestroy(list);

    RUN_TEST("SLLDestroy completed", 1);

    printf("=== Test Results: %d passed / %d total ===\n", passed_tests, total_tests);

    return 0;
}

