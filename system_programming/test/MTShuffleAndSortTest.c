/**************************************************************
 * File    : MTShuffleAndSortTest.c
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "MTShuffleAndSort.h"

/******************************************************
 * START OF ACTUAL TESTS
 ******************************************************/
#define SUCCESS (0)
#define FAILURE (1)
#define MULTIPLIER (100)
int main(void)
{
    int status = 0;
    
    if (SUCCESS != (status = ShuffleSortDictionary(MULTIPLIER,1)))
    {
        perror("1 thread Shuffle and sort failed.");
        return status;
    }
    printf("Single thread test passed successfully.\n");

    if (SUCCESS != (status = ShuffleSortDictionary(MULTIPLIER, 2)))
    {
        perror("2 threads Shuffle and sort failed.");
        return status;
    }
    printf("Two threads test passed successfully.\n");

    if (SUCCESS != (status = ShuffleSortDictionary(MULTIPLIER, 4)))
    {
        perror("4 Shuffle and sort failed.");
        return status;
    }
    printf("Four threads test passed successfully.\n");

    if (SUCCESS != (status = ShuffleSortDictionary(MULTIPLIER, 6)))
    {
        perror("6 threads Shuffle and sort failed.");
        return status;
    }
    printf("Six threads test passed successfully.\n");

    if (SUCCESS != (status = ShuffleSortDictionary(MULTIPLIER, 8)))
    {
        perror("8 threads Shuffle and sort failed.");
        return status;
    }
    printf("Eight threads test passed successfully.\n");

    if (SUCCESS != (status = ShuffleSortDictionary(MULTIPLIER, 16)))
    {
        perror("16 threads Shuffle and sort failed.");
        return status;
    }
    printf("Sixteen thread test passed successfully.\n");

    printf("MTShuffleAndSortTest passed successfully.\n");

    return 0;
}
