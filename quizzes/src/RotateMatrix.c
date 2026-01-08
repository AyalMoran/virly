/**************************************************************
 * File    : RotateMatrix.c
 * Author  : Ayal Moran
 * Reviewer: 
 * Date    : 
**************************************************************/

/*============================ INCLUDES ============================*/
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/mman.h>
#include <sys/wait.h>
#include <semaphore.h>

#include "RotateMatrix.h"

/*========================== DEFINITIONS ===========================*/

static void swap(int* a, int* b)
{
    int tmp = *a;
    *a = *b;
    *b = tmp;
}

static void ReverseArr(int* arr, int n)
{
    int i = 0;
    int j = n-1;

    while(i<=j)
    {
        swap(&arr[i],&arr[j]);
        ++i; 
        --j;
    }
}

void RotateMatrix(int n, int matrix[][n]) {
    for (int i = 0; i < n - i; i++) {
        for (int j = 0; j < n - j; j++) {
            swap(&matrix[i][j], &matrix[n-j-1][n-i-1]);
        }
    }

    for (int i = 0; i < n; i++) {
        ReverseArr(matrix[i], n);
    }
}

void PrintMat(int n, int matrix[][n]) {
    printf("The matrix is:\n");
    for (int i = 0; i < n; i++) {
        for (int j = 0; j < n; j++) {
            printf("%d\t", matrix[i][j]);
        }
        printf("\n");
    }
}
