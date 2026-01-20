/******************
 Author  : Ayal Moran
 Reviewer: Yarden
 Date    : 2.4.25
 *****************/
#include <stdio.h>
#include <stdlib.h>

#include "q.h"

/*General Formatting*/
#define RESET                    (0)
#define BRIGHT    				 (1)
#define DIM       				 (2)
#define UNDERSCORE 				 (3)
#define BLINK     				 (4)
#define REVERSE   				 (5)
#define HIDDEN    				 (6)

/*Foreground Colors*/
#define FG_BLACK  			     (30)
#define FG_RED       	         (31)
#define FG_GREEN        	     (32)
#define FG_YELLOW       	     (33)
#define FG_BLUE         	     (34)
#define FG_MAGENTA      	     (35)
#define FG_CYAN         	     (36)
#define FG_WHITE        	     (37)

/*Background Colors*/
#define BG_BLACK        	     (40)
#define BG_RED          	     (41)
#define BG_GREEN        	     (42)
#define BG_YELLOW       	     (43)
#define BG_BLUE         	     (44)
#define BG_MAGENTA      	     (45)
#define BG_CYAN         	     (46)
#define BG_WHITE        	     (47)

/*Macro to set print color*/
#define SET_PRINT_COLOR(X) printf("\x1b[%dm", X)

#define RUN_TEST(desc, expr)                \
    do {                                    \
        ++total_tests;                      \
        if (expr) 							\
        {                        		    \
            ++passed_tests;                 \
			SET_PRINT_COLOR(FG_GREEN);		\
			SET_PRINT_COLOR(BRIGHT);		\
            printf("[PASS] %s\n", desc);    \
            SET_PRINT_COLOR(RESET);			\
        } else 								\
        {                           		\
            SET_PRINT_COLOR(FG_RED);		\
			SET_PRINT_COLOR(BRIGHT);		\
            printf("[FAIL] %s\n", desc);    \
            SET_PRINT_COLOR(RESET);			\
        }                                   \
    } while (0)

int total_tests = 0;
int passed_tests = 0;

static void Test_Create(void)
{
    queue_t* ds = NULL;
    ds = QCreate();
   
    RUN_TEST("Create: Data structure creation returns non-NULL", ds != NULL);
    
	QDestroy(ds);
}

static void Test_Destroy(void)
{
   /*JUST RUN VALGRIND, STUPID!*/
}

void DequeueAndPrint(const char* msg, queue_t* ds1)
{
    printf("%s: ", msg);
    while (!QIsEmpty(ds1))
    {
        printf("%d ", *(int *)QPeek(ds1));
        QDequeue(ds1);
    }
    printf("\n");
}

static void Test_EnqDeq()
{
    queue_t* ds = NULL;
    int a, b, c, d, e, f, g, h, j, data;
    a = 1;
    b = 2;
    c = 3;
    d = 4;
    e = 5;
    f = 6;
    g = 7;
    h = 8;
    j = 9;
    
    /*Create Queue*/
    ds = QCreate();
    
    /*Test some Queue Enqueue*/
	QEnqueue(ds, &a);
    RUN_TEST("EnqDeq: After serial Enqueue and Dequeue List is NOT Empty", !QIsEmpty(ds));
	QEnqueue(ds, &b);
    RUN_TEST("QSize: After 2 Enqueue the Queue Size is 2", QSize(ds) == 2);
	QEnqueue(ds, &c);
	QEnqueue(ds, &d);
	
	/*Test Some Dequque*/
    RUN_TEST("QSize: After 4 Enqueue the Queue Size is 4", QSize(ds) == 4);
	QDequeue(ds);
    RUN_TEST("QSize: After 1 Dequeue the Queue Size is 3", QSize(ds) == 3);
    
	QEnqueue(ds, &d);
	QEnqueue(ds, &e);
	QEnqueue(ds, &f);
	QEnqueue(ds, &g);
	QEnqueue(ds, &h);
	QEnqueue(ds, &j);
	
    RUN_TEST("QSize: After 9 Enqueue the Queue Size is 9", QSize(ds) == 9);
    
    /*Testing peeking*/
    data = *(int*)QPeek(ds);
    RUN_TEST("QPeek: after 1 dequeue data should be b (2)", data == b);
    
    /*Emptying the queue until empty*/
	while(!QIsEmpty(ds))
	{
		QDequeue(ds);
	}
	
    RUN_TEST("QIsEmpty: Dequeueing all the Queue the Queue is Empty", QIsEmpty(ds));
    
    /*peeking an empty queue*/
    RUN_TEST("QPeek: peeking an empty queue should return NULL", QPeek(ds) == NULL);
    
    
    /*Destroyyyyyy*/
	QDestroy(ds);
}

static void Test_Append()
{
	/*Initialiazing*/
    queue_t* ds1 = NULL;
    queue_t* ds2 = NULL;
    int a, b, c, d, e, f, g, h, j;
    a = 1;
    b = 2;
    c = 3;
    d = 4;
    e = 5;
    f = 6;
    g = 7;
    h = 8;
    j = 9;
    /*Creating Queues*/
    ds1 = QCreate();
    ds2 = QCreate();
    /* The src Queue */
	QEnqueue(ds1, &a);
	QEnqueue(ds1, &b);
	QEnqueue(ds1, &c);
	QEnqueue(ds1, &d);
    /* The dest Queue */
	QEnqueue(ds2, &e);
	QEnqueue(ds2, &f);
	QEnqueue(ds2, &g);
	QEnqueue(ds2, &h);
	QEnqueue(ds2, &j);
	
	/*Calling Append*/
	QAppend(ds1,ds2);
	
	/*checking the dest size*/
	RUN_TEST("QAppend: After Appendage ds1 should be of size 9", QSize(ds1));
	
	/*Checking peek after appending*/
	RUN_TEST("QAppend: peeking after appending.", *(int*)QPeek(ds1) == a );
	
	/*printing the entire list after appendage*/
	SET_PRINT_COLOR(FG_CYAN);
	SET_PRINT_COLOR(BRIGHT);
	DequeueAndPrint("ds1 after appending is: " ,ds1);
	SET_PRINT_COLOR(FG_MAGENTA);
	printf("The above should be: 	  1 2 3 4 5 6 7 8 9\n");
    SET_PRINT_COLOR(RESET);
    
    {
    	/*appending 2 empty lists*/
    	queue_t* empty1 = QCreate();
    	queue_t* empty2 = QCreate();
    	queue_t* empty3 = QCreate();
    	QAppend(empty1,empty2);
    	RUN_TEST("Appending 2 empty lists should result in an empty list: ", QIsEmpty(empty1));
    	
    	/*appending the non empty to the empty one*/
    	QEnqueue(empty3, &a);
    	QEnqueue(empty3, &g);
    	QEnqueue(empty3, &c);    	
    	QAppend(empty1,empty3);
    	
    	RUN_TEST("QAppend: the empty dest list size is 3 after appending ", QSize(empty1) == 3);
    	RUN_TEST("Appending a non-empty list to an empty1 should  essentialy result in the non empty list: ", *(int*)QPeek(empty1) == a);
    	
    	QDestroy(empty1);
		QDestroy(empty2);
		QDestroy(empty3);
    }
    
	QDestroy(ds1);
	QDestroy(ds2);

}

int main(void)
{
    Test_Create();
    Test_Destroy();
	Test_EnqDeq();
	Test_Append();
	
	SET_PRINT_COLOR(BG_BLACK);
    printf("=== Test Results: %d passed / %d total ===  \033[1;0m \n", passed_tests, total_tests);
	SET_PRINT_COLOR(RESET);
    return 0;
}
