#ifndef ILRD_KTHSMALLESTELEMENT_H
#define ILRD_KTHSMALLESTELEMENT_H

#include <stddef.h>
/*
Implement a function that, given an array of unique integers and an index k (which is less than the array size), returns the value of the k-th smallest element.

For example, given the array [ 8, 6, 12, 5, 3, 27, 15, 33 ], the 3rd (k = 3) smallest element is 6 (at index 1).


Constraints:
Please note that k == 1 for the 1st smallest element.
Required time complexity is less than O(n * log(n)).
Consider using a data structure in your implementation. To view its header file, click the API button.
In case of an error, the function should return -1, otherwise zero. */

int KthSmallestElement(const int numbers[], size_t size, size_t k);

#endif /* ILRD_KTHSMALLESTELEMENT_H */
