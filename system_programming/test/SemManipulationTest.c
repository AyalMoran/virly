/**************************************************************
 * File    : SemManipulationTest.c
 * Author  : Ayal Moran
 * Reviewer: Chaya T.
 * Date    : 24-12-2025
**************************************************************/
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>


#include "SemManipulation.h"

/******************************************************
 * START OF ACTUAL TESTS
 ******************************************************/

int main(int argc, char* argv[])
{


    if (2 != argc)
    {
        fprintf(stderr, "Usage: %s <semaphore_name>\n", argv[0]);
        return EXIT_FAILURE;
    }

    SemManipulation(argv[1]);


    return 0;
}