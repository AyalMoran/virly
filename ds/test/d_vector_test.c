/*************************************
 *            Author: Ayal Moran      *
 *         Reviewer:   Yarden         *
 *           Date: 30March            *
 *************************************/
#include <stdio.h>    /* printf */
#include <assert.h>   /* assert */
#include <string.h>   /* strcmp */
#include <stdlib.h>

#include "d_vector.h"

#define SHRINK_CONDITION (4)

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

/* Test Get,Push,Pop */
static void TestVecPushAndPop(void)
{
	size_t i = 0;
	int i1 = 0;
	int i2 = 0;
	int i3 = 0;

	size_t sz1 = 0;
	size_t sz2 = 0;

	int ele1 = 9;
	int ele2 = 7;
	int ele3 = 5;
	int ele4 = 3;
	int ele5 = 1;
	int ele6 = -3;
	int ele7 = 111;

	d_vector_t* vec = NULL;

	vec = DVectorCreate(30, sizeof(int));
	
	DVectorPushBack(vec, &ele1);
	DVectorPushBack(vec, &ele2);
	DVectorPushBack(vec, &ele3);
	DVectorPushBack(vec, &ele4);
	DVectorPushBack(vec, &ele5);
	DVectorPushBack(vec, &ele6);
	DVectorPushBack(vec, &ele7);
	
	for (i = DVectorSize(vec); i < DVectorCapacity(vec); i += 1)
	{
		DVectorPushBack(vec, &ele2);
	}
	sz1 = DVectorSize(vec);
	printf("curr size on line %d: %lu\n", __LINE__, sz1);
	i1 = *(int*)DVectorGetAccessToElement(vec, DVectorSize(vec)-1);
	printf("Shirnk shouyld be called\n");
	for (i = DVectorSize(vec); i > DVectorCapacity(vec)/SHRINK_CONDITION; --i)
	{
		DVectorPopBack(vec);
	}
	DVectorPopBack(vec);	
	i2 = *(int*)DVectorGetAccessToElement(vec, DVectorSize(vec)-1);
	DVectorPopBack(vec);
	DVectorPopBack(vec);	
	i3 = *(int*)DVectorGetAccessToElement(vec, DVectorSize(vec)-1);
	DVectorPopBack(vec);
	printf("curr size on line %d: %ld\n", __LINE__, sz1);
	DVectorPushBack(vec, &ele3);
	DVectorPushBack(vec, &ele4);
	i2 = *(int*)DVectorGetAccessToElement(vec, DVectorSize(vec)-1);
	DVectorPopBack(vec);
	i3 = *(int*)DVectorGetAccessToElement(vec, DVectorSize(vec)-1);
	
	printf("curr cap on line %d: %ld\n", __LINE__, DVectorCapacity(vec));
	sz1 = DVectorSize(vec);
	printf("curr size on line %d: %ld\n", __LINE__, sz1);
	DVectorPopBack(vec);
	sz2 = DVectorSize(vec);
	printf("curr size on line %d: %ld\n", __LINE__, sz2);
	
	DVectorReserve(vec, 100);
	printf("curr cap on line %d: %ld\n", __LINE__, DVectorCapacity(vec));
	printf("curr size on line %d: %ld\n", __LINE__, DVectorSize(vec));
	DVectorPushBack(vec, &ele3);
	DVectorPushBack(vec, &ele4);
	printf("curr size on line %d: %ld\n", __LINE__, DVectorSize(vec));
	
	for (i = DVectorSize(vec); i > DVectorCapacity(vec)/SHRINK_CONDITION; --i)
	{
		DVectorPopBack(vec);
	}
	DVectorPopBack(vec);
	DVectorPopBack(vec);
	printf("curr cap on line %d: %ld\n", __LINE__, DVectorCapacity(vec));
	printf("curr size on line %d: %ld\n", __LINE__, DVectorSize(vec));
	
	for (i = 0; i < 8; i += 1)
	{

		DVectorPushBack(vec, &ele2);
	}
	
	printf("curr size on line %d: %ld\n", __LINE__, DVectorSize(vec));
	printf("curr cap on line %d: %ld\n", __LINE__, DVectorCapacity(vec));
	
	DVectorPushBack(vec, &ele2);
	
	printf("curr size on line %d: %ld\n", __LINE__, DVectorSize(vec));
	printf("curr cap on line %d: %ld\n", __LINE__, DVectorCapacity(vec));
	
	PrintTestResult("TestVecPushAndPop - sizes", (sz1 == sz2+1));
	PrintTestResult("TestVecPushAndPop - 7", (i1 == ele2));
	PrintTestResult("TestVecPushAndPop - 5", (i2 == ele4));
	PrintTestResult("TestVecPushAndPop - 3", (i3 == ele3));
	
	DVectorDestroy(vec);
}

int main(void)
{
    printf("=== Running Stack Tests ===\n\n");

    TestVecPushAndPop();
    
    printf("\n=== Tests Complete ===\n");
    return 0;
}
