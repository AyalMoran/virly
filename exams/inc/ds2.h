#ifdef Q1
typedef struct Node*
{
    int data;
    struct Node* next;
}
node_t;

node_t* FlipIter(node_t* head);
node_t* FlipRec(node_t* node);

#endif /* Q1 */
#ifdef Q2

int maxSubArraySum(const int arr[], size_t size);
#endif /* Q2 */
#ifdef Q3
#    include "stack.h"

stack_t* stack_sort(stack_t* to_sort);
#endif /* Q3 */
#ifdef Q4
#    include <limits.h>
#    include <stdio.h>
#    include <string.h>
int sort_chars_in_file(const char* file_name, char* result);
#endif /* Q4 */
#ifdef Q5
bst_node_t* CreateNode(int data);

bst_node_t* BSTInsertIter(bst_node_t* root, int data);

bst_node_t* BSTInsertRec(bst_node_t* root, int data);

struct bst_arr
{
    int* arr[];
    size_t cap;
};

int BstArrInsert(struct bst_arr* tree, int* data);

#endif /* Q5 */
#ifdef Q6

#endif /* Q6 */
#ifdef Q7
void ReverseString(char* str);

#endif /* Q7 */
#ifdef Q8

int StringPerm(const char* str);

#endif /* Q8 */
#ifdef Q9
#endif /* Q9 */
#ifdef Q10
#include "stack.h"
int stack_insert(stack_t* stack, int data);

#endif /* Q10 */
