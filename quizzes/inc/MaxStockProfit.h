#ifndef ILRD_MAXSTOCKPROFIT_H
#define ILRD_MAXSTOCKPROFIT_H

#include <stddef.h>
/*
A given array contains integer values representing the price of single stock throughout a day. The array is arranged by time, such that if element i indicates the price at a certain time then element i+1 indicates the price at a later time.

Implement a function that determines which two indexes, representing a buy and a sell orders (buy before sell, obviously), yield the highest profit.

For example, in the array [ 11, 12, 3, 5, 1, 7, 9, 2 ] the buy index is 4 (price 1), the sell index is 6 (price 9) and therefore the profit is 8.

Constraints:
The function should traverse the array only once.
The function should return the buy and sell indexes.
*/

typedef struct Result
{
    size_t buy_index;
    size_t sell_index;
} result_ty;

result_ty MaxStockProfit(const int prices[], size_t size);

#endif /* ILRD_MAXSTOCKPROFIT_H */
