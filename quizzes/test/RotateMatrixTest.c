/**************************************************************
 * File    : RotateMatrixTest.c
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "RotateMatrix.h"
#include "test_utils.h"

/******************************************************
 * START OF ACTUAL TESTS
 ******************************************************/

int main(void) {
    int matrix[3][3] = {{1, 2, 3}, {4, 5, 6}, {7, 8, 9}};
    int n = 3;

    printf("Original matrix:\n");
    PrintMat(n, matrix);

    RotateMatrix(n, matrix);

    printf("\nMatrix after 90 degree rotation:\n");
    PrintMat(n, matrix);

    return 0;
}
