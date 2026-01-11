#include <stdio.h>
#include <assert.h>

#include <stdlib.h>
#ifdef Q3

#include <stack.h>
#endif /* Q3 */

#include "ds2.h"

int main(int argc, char** argv)
{
    size_t i = 0;
    #ifdef Q1
    assert();
    #endif /* Q1 */

    #ifdef Q2
    int arr[] = {-4, -22, 10, 3, 5, 1, 3};
    long res = maxSubArraySum(arr, sizeof(arr) / sizeof(arr[0]));
    printf("Max sub array sum is: %ld\n", res);
    #endif /* Q2 */
    
    #ifdef Q3
    stack_t* to_sort = NULL;
    stack_t* sorted = NULL;
    int arr[] = {4, 2, 5, 1, 3};    
    to_sort = StackCreate(5, sizeof(int));
    for (i = 0; i < sizeof(arr) / sizeof(arr[0]); ++i)
    {
        StackPush(to_sort, &arr[i]);
    }
    sorted = stack_sort(to_sort);
    printf("Sorted stack:\n");
    while (!StackIsEmpty(sorted))
    {
        printf("%d\n", *(int*)StackPeek(sorted));
        StackPop(sorted, 0);
    }

    #endif /* Q3 */
    #ifdef Q4
    #endif /* Q4 */
    #ifdef Q5
    #endif /* Q5 */
    #ifdef Q6
    #endif /* Q6 */
    #ifdef Q7
    #endif /* Q7 */
    #ifdef Q8
    #endif /* Q8 */
    #ifdef Q9
    #endif /* Q9 */
    #ifdef Q10
    #endif /* Q10 */

    return 0;
}