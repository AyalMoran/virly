/**************************************************************
 * File    : MaxStockProfitTest.c
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "MaxStockProfit.h"
#include "test_utils.h"

/******************************************************
 * START OF ACTUAL TESTS
 ******************************************************/

static void PrintArray(const int arr[], size_t size)
{
    size_t i = 0;
    printf("[ ");
    for (i = 0; i < size; ++i)
    {
        printf("%d", arr[i]);
        if (i < size - 1)
        {
            printf(", ");
        }
    }
    printf(" ]\n");
}

int main(void)
{
    int prices[] = {11, 12, 3, 5, 1, 7, 9, 2};
    size_t size = sizeof(prices) / sizeof(prices[0]);
    result_ty result = {0, 0};
    
    printf("Stock prices throughout the day:\n");
    PrintArray(prices, size);
    printf("\n");
    
    result = MaxStockProfit(prices, size);
    
    printf("Buy index: %zu (price: %d)\n", result.buy_index, prices[result.buy_index]);
    printf("Sell index: %zu (price: %d)\n", result.sell_index, prices[result.sell_index]);
    printf("Profit: %d\n", prices[result.sell_index] - prices[result.buy_index]);
    printf("\nExpected: Buy index 4 (price 1), Sell index 6 (price 9), Profit 8\n");
    
    return 0;
}
