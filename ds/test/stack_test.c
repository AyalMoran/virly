#include <stdio.h>    /* printf */
#include <assert.h>   /* assert */
#include <string.h>   /* strcmp */
#include <stddef.h>
#include "stack.h"

/* Helper function to print test results */
static void PrintTestResult(const char* testName, int condition)
{
    if (condition)
    {
        printf("%s: PASSED\n", testName);
    }
    else
    {
        printf("%s: FAILED\n", testName);
    }
}

/* Test Push, Pop and Peek */
static void TestStackPushPopAndPeek(void)
{
	int i = 0;	
	int j = 0;
	int k = 0;
	int n = 0;

	int push_object1 = 302;
	int push_object2 = 45;
	int push_object3 = 23;
	int push_object4 = 666;
	int is_empty = -2;

	stack_t* st = StackCreate(3, 4);
	printf("Stack created with capacity 3 and element size 4 bytes.\n");

	StackPush(st, &push_object1);
	printf("Stack pushed 1 element.\n");
	StackPush(st, &push_object2);
	StackPush(st, &push_object3);
	printf("Stack pushed 3 elements.\n");
	i = *(int*)(StackPeek(st));
	printf("%d\n", i);
	
	StackPop(st, 1);
	j = *(int*)(StackPeek(st));
	printf("%d\n", j);
	
	is_empty = StackIsEmpty(st);
    PrintTestResult("TestStackPushAndPop - IsEmpty", (is_empty == 0));
    
	StackPop(st, 0);
	StackPush(st, &push_object4);
	k = *(int*)(StackPeek(st));
	printf("%d\n", k);
	
	StackPop(st, 1);
	n = *(int*)(StackPeek(st));
	
	StackPop(st, 1);
	is_empty = StackIsEmpty(st);
	
	PrintTestResult("TestStackPushAndPop - 23", (i == 23));
    PrintTestResult("TestStackPushAndPop - 45", (j == 45));
    PrintTestResult("TestStackPushAndPop - 666", (k == 666));
    PrintTestResult("TestStackPushAndPop - 302", (n == 302));
    PrintTestResult("TestStackPushAndPop - IsEmpty", (is_empty == 1));
    
    StackDestroy(st);
	st = NULL;

}

int main(void)
{
    printf("=== Running Stack Tests ===\n\n");

    TestStackPushPopAndPeek();
    
    printf("\n=== Tests Complete ===\n");
    return 0;
}
