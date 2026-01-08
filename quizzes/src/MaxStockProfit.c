/**************************************************************
 * File    : MaxStockProfit.c
 * Author  : Ayal Moran
 * Reviewer: 
 * Date    : 
**************************************************************/

/*============================ INCLUDES ============================*/
#include <stddef.h>
#include <limits.h>

#include "MaxStockProfit.h"

/*========================== DEFINITIONS ===========================*/

result_ty MaxStockProfit(const int prices[], size_t size)
{
    int min_price = INT_MAX;
    int max_profit = 0;
    size_t i = 0;
    size_t j = 0;
    int potential_profit = 0;
    result_ty res = {0,1};
    
    if (size == 0)
    {
        return res;
    }
    
    for (; i < size; ++i) 
    {
        if (prices[i] < min_price) 
        {
            min_price = prices[i];
            j = i;
        }
        
        potential_profit = prices[i] - min_price;
        
        if (potential_profit > max_profit) 
        {
            max_profit = potential_profit;
            res.sell_index = i;
            res.buy_index = j;

        }
    }

    return res;
}
