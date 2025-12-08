/******************
 Author : Ayal Moran
 Reviewer: Susie Altalef-Cohen
 Date: 08.04.25
******************/
#include <stdio.h> /* printf */
#include <stdlib.h> /* malloc */

#include "DLL.h"

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

/* Macro to set print color */
#define SET_PRINT_COLOR(X) printf("\x1b[%dm", X)

#define PRINT_TEST_HEADER(name) 						\
	do {												\
		SET_PRINT_COLOR(BRIGHT);						\
		SET_PRINT_COLOR(FG_BLUE);						\
		SET_PRINT_COLOR(BG_YELLOW);						\
		printf("=====STARTING %s TESTS=====", name);	\
		SET_PRINT_COLOR(RESET);							\
		printf("\n");									\
		} while(0)										\
		
/* Macro to run tests */
#define RUN_TEST(desc, expr, line)          \
    do {                                    \
        ++total_tests;                      \
        if (expr)                           \
        {                                   \
            ++passed_tests;                 \
            SET_PRINT_COLOR(FG_GREEN);      \
            SET_PRINT_COLOR(BRIGHT);        \
            printf("[PASS] %s [line %d]\n", desc, line);    \
            SET_PRINT_COLOR(RESET);         \
        } else {                            \
            SET_PRINT_COLOR(FG_RED);        \
            SET_PRINT_COLOR(BRIGHT);        \
            printf("[FAIL] %s\n", desc);    \
            SET_PRINT_COLOR(RESET);         \
        }                                   \
    } while (0)

int total_tests = 0;
int passed_tests = 0;

static void PrintListFromEnd(const char* msg, dllist_t *list);
static void PrintList(const char* msg, dllist_t *list);
static void Test_Create(void);
static void Test_InsertRemove(void);
static void Test_PushPopFront(void);
static void Test_Count(void);
static void Test_Find(void);
static void Test_MultiFind(void);
static void Test_Splice(void);
static int MatchInt(const void *data, void *param);

int main(void)
{
	PRINT_TEST_HEADER("OVERALL");
	printf("===================\n");
    Test_Create();
	Test_InsertRemove();
	Test_PushPopFront();
	Test_Count();
	Test_Find();
	Test_MultiFind();
	Test_Splice();
    printf("=== Test Results: %d passed / %d total ===\n", passed_tests, total_tests);
    
    return 0;
}

static int MatchInt(const void *data, void *param)
{
    return (*(int *)data == *(int *)param);
}

static void PrintListFromEnd(const char* msg, dllist_t *list)    
{   
    dll_iter_t iter = DLLPrev(DLLEnd(list));

	SET_PRINT_COLOR(FG_CYAN);
    printf("%s: ", msg);
	SET_PRINT_COLOR(FG_YELLOW);
	if(DLLIsEmpty(list))
	{
	   printf("{empty}\n");
       SET_PRINT_COLOR(RESET);
	   return;
	}
    while (!DLLIterIsEqual(iter, DLLBegin(list)))
    {
        printf("%d ", *(int *)DLLGetData(iter));
        iter = DLLPrev(iter);
    }
    printf("%d ", *(int *)DLLGetData(iter));
    SET_PRINT_COLOR(RESET);
    printf("\n");
}

static void PrintList(const char* msg, dllist_t *list)    
{   
    dll_iter_t iter = DLLBegin(list);
	SET_PRINT_COLOR(FG_CYAN);
    printf("%s: ", msg);
	SET_PRINT_COLOR(FG_YELLOW);
	if(DLLIsEmpty(list))
	{
	   printf("{empty}\n");
       SET_PRINT_COLOR(RESET);
	   return;
	}
    while (!DLLIterIsEqual(iter, DLLEnd(list)))
    {
        printf("%d ", *(int *)DLLGetData(iter));
        iter = DLLNext(iter);
    }
    SET_PRINT_COLOR(RESET);
    printf("\n");
}

static void Test_Create(void)
{
    dllist_t* dll = DLLCreate();
    
	PRINT_TEST_HEADER("CREATE");
   
    RUN_TEST("Create: list creation returns non-NULL", dll != NULL, __LINE__);
    
    DLLDestroy(dll);
}

static void Test_InsertRemove(void)
{
    dllist_t* dll = DLLCreate();
    int a = 10, b = 20, c = 30, d = 40, e = 50, f = 60;
   	int expected;
   	dll_iter_t iter = DLLInsert(DLLBegin(dll), &a);
   	
   	expected = *(int*)DLLGetData((iter));
	PRINT_TEST_HEADER("INSERT\\REMOVE");	
    RUN_TEST("Insert: Insert at DLLBegin(dll) and then GetData", expected == a, __LINE__);
    iter = DLLInsert(iter, &b);
    iter = DLLInsert(iter, &c);
    iter = DLLInsert(iter, &d);
    
    SET_PRINT_COLOR(FG_CYAN);    
    PrintList("the list should be '40 30 20 10'", dll);
    
    iter = DLLNext(iter);
    iter = DLLNext(iter);
    
    DLLInsert(iter, &e);

    PrintList("the list should be '40 30 50 20 10'", dll);
    
    iter = DLLInsert(DLLEnd(dll), &f);
   	expected = *(int*)DLLGetData((iter));
   	
    PrintList("the list after Iserting to DLLEnd()", dll);

    RUN_TEST("Insert: Insert at DLLEnd(dll) and then GetData", expected == f, __LINE__);
    
    DLLRemove(DLLBegin(dll));
   	expected = *(int*)DLLGetData(DLLBegin(dll));
    RUN_TEST("Remove: Removing at DLLBegin results as expected", expected == c, __LINE__);
    
    DLLRemove(DLLPrev(DLLEnd(dll)));
   	expected = *(int*)DLLGetData(DLLPrev(DLLEnd(dll)));
    RUN_TEST("Remove: Removing at DLLEnd results as expected", expected == a, __LINE__);
    
    
    printf("the list currenty at line: %d\n", __LINE__);
    PrintList("", dll);
    iter = DLLNext(DLLNext(DLLBegin(dll))); /*should be*/
	iter = DLLRemove(iter);
    printf("the list currenty at line: %d\n", __LINE__);
    PrintList("", dll);
   	expected = *(int*)DLLGetData(iter);

    RUN_TEST("Remove: Removing at DLLBegin results as expected", expected == a, __LINE__);
    
    DLLDestroy(dll);
}

static void Test_PushPopFront(void)
{
    dllist_t* dll = DLLCreate();
	int a = 10, b = 20, c = 30, d = 40, e = 50, f = 60;
   	int expected, expected2;
   	
	PRINT_TEST_HEADER("PUSH\\POP");	
	
	/*FRONT*/
   	DLLPushFront(dll, &a);
   	PrintList("list after push", dll);
   	expected = *(int*)DLLPopFront(dll);
    RUN_TEST("FRONT: PushPop: push and pop returned the same element", a == expected, __LINE__);
    RUN_TEST("FRONT: PushPop: After popping a list with a single element the list is now empty", DLLIsEmpty(dll), __LINE__);
    
   	RUN_TEST("FRONT: PushPop: push and pop returned the same element", a == expected, __LINE__);;
   	DLLPushFront(dll, &a);
   	DLLPushFront(dll, &b);
   	DLLPushFront(dll, &c);
   	expected = *(int*)DLLPopFront(dll);
   	expected2 = *(int*)DLLPopFront(dll);
   	RUN_TEST("FRONT: PushPop: asserting FIFO propriety", ((c == expected) && (b == expected2)), __LINE__);
    DLLPopFront(dll);
    
    /*BACK*/
    DLLPushBack(dll, &f);
   	PrintList("list after push", dll);
   	expected = *(int*)DLLPopBack(dll);
    RUN_TEST("BACK: PushPop: push and pop returned the same element", f == expected, __LINE__);
    RUN_TEST("BACK: PushPop: After popping a list with a single element the list is now empty", DLLIsEmpty(dll), __LINE__);
    
    DLLDestroy(dll);
}

static void Test_Count(void)
{
    dllist_t* dll = DLLCreate();
	int a = 10, b = 20, c = 30, d = 40, e = 50, f = 60;
   	int expected, expected2;
   	
	PRINT_TEST_HEADER("COUNT");	
	
	expected = DLLCount(dll);
   	RUN_TEST("COUNT: DLLCount of empty list", 0 == expected, __LINE__);
   	DLLPushFront(dll, &a);
   	DLLPushFront(dll, &d);
   	DLLPushFront(dll, &c);
   	DLLPushFront(dll, &b);
   	expected = DLLCount(dll);
   	RUN_TEST("COUNT: DLLCount after 4 pushes, returns 4", 4 == expected, __LINE__);
   	DLLPopFront(dll);
   	expected = DLLCount(dll);
   	RUN_TEST("COUNT: DLLCount after 4 pushes 1 pop, returns 3", 3 == expected, __LINE__);
    DLLDestroy(dll);
}

static void Test_Find(void)
{
    dllist_t* dll = DLLCreate();
    dll_iter_t found = NULL;
	int a = 10, b = 20, c = 30, d = 40, e = 50, f = 60;
   	int expected, expected2;
   	int target;
   	
	PRINT_TEST_HEADER("FIND");	

   	DLLPushFront(dll, &a);
   	DLLPushFront(dll, &d);
   	DLLPushFront(dll, &c);
   	DLLPushFront(dll, &b);
   	
   	target = c;
    found = DLLFind(DLLBegin(dll), DLLEnd(dll), MatchInt, &target);
	RUN_TEST("DLLFind: found element target", 
             !DLLIterIsEqual(found, DLLEnd(dll)) && (*(int *)DLLGetData(found) == c), __LINE__);
             
	target = 666;    
 	found = DLLFind(DLLBegin(dll), DLLEnd(dll), MatchInt, &target);
	RUN_TEST("DLLFind: searching for non existent element returns DLLEnd", 
             DLLIterIsEqual(found, DLLEnd(dll)), __LINE__);
             
    DLLDestroy(dll);
}

static void Test_MultiFind(void)
{
    dllist_t* dll = DLLCreate();
    dllist_t* dest = DLLCreate();
    dll_iter_t found = NULL;
	int a = 10, b = 20, c = 30, d = 40, e = 50, f = 60;
   	int expected, expected2;
   	int target;
   	
	PRINT_TEST_HEADER("MULTI FIND");	
	
   	DLLMultiFind(DLLBegin(dll),DLLEnd(dll), MatchInt, &d, dest);
	RUN_TEST("DLLMultiFind: searching for non existent element returns an empty list", 
             DLLIsEmpty(dest), __LINE__);
   	DLLPushFront(dll, &a);
   	DLLPushFront(dll, &d);/**/
   	DLLPushFront(dll, &c);
   	DLLPushFront(dll, &d);/**/
   	DLLPushFront(dll, &d);/**/
   	DLLPushFront(dll, &b);
   	DLLPushFront(dll, &d);/**/
   	DLLPushFront(dll, &b);
   	DLLPushFront(dll, &a);
   	DLLPushFront(dll, &d);/**/
   	PrintList("dest before DLLMultiFind: ", dest); 
   	PrintList("searching for 40 in list DLLMultiFind: ", dll);   	  	
   	DLLMultiFind(DLLBegin(dll),DLLEnd(dll), MatchInt, &d, dest);
   	PrintList("dest after DLLMultiFind: ", dest);

    DLLDestroy(dll);
    DLLDestroy(dest);
}

static void Test_Splice(void)
{
    dllist_t* dest = DLLCreate();
    dllist_t* src = DLLCreate();
    dll_iter_t from, to, where;
	int a = 10, b = 20, c = 30, d = 40, e = 50, f = 60;
   	int expected, expected2;
   	int target;
   	
	PRINT_TEST_HEADER("SPLICE");	
	
   	DLLPushFront(dest, &f);
   	DLLPushFront(dest, &a);
   	DLLPushFront(dest, &a);
   	DLLPushFront(dest, &a);
   	DLLPushFront(dest, &a);
   	
   	DLLPushFront(src, &b);
   	DLLPushFront(src, &c);
   	DLLPushFront(src, &d);
   	
   	where = DLLNext(DLLNext(DLLBegin(dest)));
   	from  = DLLBegin(src);
   	to 	  = DLLEnd(src);
   	
   	SET_PRINT_COLOR(BG_YELLOW);
   	printf("BEFORE SPLICE:");
   	SET_PRINT_COLOR(RESET);
   	printf("\n");
   	
   	PrintList("dest: " ,dest);
   	PrintList("src: " ,src);
   	
   	DLLSplice(where,from,to);
   	
   	SET_PRINT_COLOR(BG_YELLOW);
   	printf("AFTER SPLICE:");
   	SET_PRINT_COLOR(RESET);
   	printf("\n");
   	
   	PrintList("dest: " ,dest);
   	PrintList("src: " ,src);
   	
   	PrintListFromEnd("here is dest from the end: ",dest);
   	PrintListFromEnd("here is src from the end: ", src);
   	printf("\n");
    DLLDestroy(src);
    DLLDestroy(dest);
}


