#ifdef Q1
typedef struct Node*
{
    int data;
    struct Node* next;
}
node_t;

node_t* FlipIter(node_t* head)
{

    node_t* prev = NULL;
    node_t* curr = node;
    node_t* next = NULL;

    while (curr)
    {
        next = curr->next;
        curr->next = prev;
        prev = curr;
        curr = next;
    }

    return prev;
}

node_t* FlipRec(node_t* node)
{
    node_t* new_head = NULL;

    if (node == NULL || node->next)
    {
        return node;
    }

    new_head = Flip(node->next);
    node->next->next = node;
    node->next = NULL;

    return new_head;
}

#endif /* Q1 */
#ifdef Q2
#    include <limits.h>
#    include <stddef.h>

#    define MAX(a, b) ((a) > (b) ? (a) : (b))

long maxSubArraySum(const int arr[], size_t size)
{
    size_t i = 0;

    long global_sum = INT_MIN;
    long curr_sum = 0;

    for (i = 0; i < size; ++i)
    {
        global_sum = MAX(global_sum, curr_sum + arr[i]);
        curr_sum = MAX(curr_sum + arr[i], 0);
    }

    return global_sum;
}

#endif /* Q2 */
#ifdef Q3
#    include "stack.h"
#    include <assert.h>
stack_t* stack_sort(stack_t* to_sort)
{
    int* tmp = 0;
    stack_t* sorted = NULL;

    assert(to_sort);

    if (StackIsEmpty(to_sort))
    {
        return to_sort;
    }

    sorted = StackCreate(StackCapacity(to_sort), sizeof(int));
    if (!sorted)
    {
        return NULL;
    }

    StackPush(sorted, StackPeek(to_sort));
    StackPop(to_sort, 0);

    while (!StackIsEmpty(to_sort))
    {
        tmp = (int*) StackPeek(to_sort);
        StackPop(to_sort, 0);

        while (!StackIsEmpty(sorted) && *(int*)StackPeek(sorted) > *tmp)
        {
            StackPush(to_sort, StackPeek(sorted));
            StackPop(sorted, 0);
        }

        StackPush(sorted, tmp);
    }

    return sorted;
}

#endif /* Q3 */
#ifdef Q4
#    include <assert.h>
#    include <limits.h>
#    include <stdio.h>
#    include <string.h>

int sort_chars_in_file(const char* file_name, char* result)
{
    FILE* fptr = NULL;
    size_t LUT[256] = {0};
    int ch = 0;
    int i = 0;

    assert(NULL != file_name);
    assert(NULL != result);

    fptr = fopen(file_name, "rb");
    if (NULL == fptr)
    {
        return 1;
    }

    while (EOF != (ch = fgetc(fptr)))
    {
        ++LUT[(unsigned char) ch];
    }

    for (i = 0; i < 256; ++i)
    {
        memset(result, i, LUT[i]);
        result += LUT[i];
    }

    if (EOF == fclose(fptr))
    {
        return 1;
    }

    return 0;
}

#endif /* Q4 */
#ifdef Q5
bst_node_t* CreateNode(int data)
{
    bst_node_t* new = NULL;

    new = (bst_node_t*) malloc(sizeof(bst_node_t));
    if (NULL == new)
    {
        return NULL;
    }

    new->data = data;
    new->right = NULL;
    new->left = NULL;

    return new;
}

bst_node_t* BSTInsertIter(bst_node_t* root, int data)
{
    bst_node_t* parent = NULL;
    int direction = 0;

    if (root == NULL)
    {
        root = CreateNode(data);
        return root;
    }

    while (root)
    {
        parent = root;

        if (parent->data > data)
        {
            root = parent->left;
            direction = 0;
        }
        else
        {
            root = parent->right;
            direction = 1;
        }
    }

    root = CreateNode(data);

    if (direction)
    {
        parent->right = root;
    }
    else
    {
        parent->left = root;
    }

    return root;
}

bst_node_t* BSTInsertRec(bst_node_t* root, int data)
{
    if (!root)
    {
        root = CreateNode(data);

        return root;
    }

    if (data > root->data)
    {
        root->right = BSTInsert(root->right, data);
    }
    else
    {
        root->left = BSTInsert(root->left, data);
    }

    return root;
}

#    define LEFT_CHILD(i) (i * 2 + 1)
#    define RIGHT_CHILD(i) (i * 2 + 2)

struct bst_arr
{
    int* arr[];
    size_t cap;
};

int BstArrInsert(struct bst_arr* tree, int* data)
{
    size_t i = 0;

    assert(tree);

    while (i < tree->cap && tree->arr[i])
    {
        i = (*data) < *(tree->arr[i]) ? LEFT_CHILD(i) : RIGHT_CHILD(i);
    }
    if (i < tree->cap)
    {
        tree->arr[i] = data;
        return 0;
    }
    else
    {
        return 1;
    }
}

#endif /* Q5 */
#ifdef Q6

#endif /* Q6 */
#ifdef Q7
void ReverseString(char* str)
{
    size_t len = 0;

    assert(str);

    len = strlen(str);
    if (0 == len)
    {
        return;
    }

    recRevStr(str, 0, len - 1);
}

void recRevStr(char* str, size_t start, size_t end)
{
    char tmp = 0;

    if (start >= end)
    {
        return;
    }

    tmp = str[start];
    str[start] = str[end];
    str[end] = tmp;

    recRevStr(str, start + 1, end - 1);
}
#endif /* Q7 */
#ifdef Q8
void PrintSuffices(char* str, size_t len)
{
    size_t i = 0;

    for (i = 0; i <= len; ++i)
    {
        printf("%s\n", str + i);
    }
}

void recStringPerm(char* str, size_t start, size_t end)
{
    size_t i = 0;

    assert(str);

    if (start == end)
    {
        PrintSuffices(str, strlen(str));
        return;
    }

    for (i = start; i < end; ++i)
    {
        swap(str, start, end);
        recStringPerm(str, start + 1, end);
        swap(str, start, end);
    }
}

int StringPerm(const char* str)
{
    char* copy = NULL;

    assert(str);

    copy = (char*) malloc(strlen(str) + 1);
    if (!copy)
    {
        return 1;
    }

    strcpy(copy, str);
    recStringPerm(copy, 0, strlen(str));

    return 0;
}

#endif /* Q8 */
#ifdef Q9
#endif /* Q9 */
#ifdef Q10
int stack_insert(stack_t* stack, int data)
{
    int top = 0;

    assert(stack);

    if (StackIsEmpty(stack) || StackPeek(stack) < data)
    {
        StackPush(stack, data);
        return;
    }

    top = StackPeek(stack);
    StackPop(stack);

    stack_insert(stack, data);
    StackPush(stack, top);
}

#endif /* Q10 */
