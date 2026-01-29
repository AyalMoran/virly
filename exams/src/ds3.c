/* 1.
Implement an array data structure with the following functions in O(1):

void SetVal(int_array_t* array, int indx, int val);
int GetVal(int_array_t* array, int indx);
void SetAll(int_array_t* array, int val);  no memset()
You may declare and implement Create() and Destroy() as well. */
#include <assert.h>
#include <stdlib.h>

typedef struct int_array
{
    size_t size;
    int* values;
    unsigned int* ver;
    unsigned int set_all_ver;
    int set_all_val;
} int_array_t;

int_array_t* Create(size_t size, int init_val)
{
    size_t i = 0;
    int_array_t* arr = (int_array_t*)malloc(sizeof(*arr));
    if (!arr)
    {
        return NULL;
    }

    arr->values = (int*)malloc(sizeof(int) * size);
    arr->ver = (unsigned int*)malloc(sizeof(unsigned int) * size);
    if (!arr->values || !arr->ver)
    {
        free(arr->values);
        free(arr->ver);
        free(arr);
        return NULL;
    }

    arr->size = size;
    arr->set_all_ver = 1;
    arr->set_all_val = init_val;

    for (i = 0; i < size; ++i)
    {
        arr->ver[i] = 0;
        arr->values[i] = 0;
    }

    return arr;
}

void Destroy(int_array_t* array)
{
    if (!array)
    {
        return;
    }
    free(array->values);
    free(array->ver);
    free(array);
}

void SetAll(int_array_t* array, int val)
{
    size_t i = 0;

    assert(array);

    array->set_all_val = val;
    ++array->set_all_ver;

    if (0 == array->set_all_ver)
    {
        array->set_all_ver = 1;
        for (i = 0; i < array->size; ++i)
        {
            array->ver[i] = 0;
        }
    }
}

void SetVal(int_array_t* array, int indx, int val)
{
    assert(array);
    assert(indx >= 0 && (size_t)indx < array->size);

    array->values[indx] = val;
    array->ver[indx] = array->set_all_ver;
}

int GetVal(int_array_t* array, int indx)
{
    assert(array);
    assert(indx >= 0 && (size_t)indx < array->size);

    return (array->ver[indx] == array->set_all_ver) ? array->values[indx]
                                                    : array->set_all_val;
}

/* 2.Given an array of unsigned ints and some number “sum_of_two”, write a
 * function finding two array values that gives the sum of the given number
 * (sum_of_two). Also write the time complexity of your solution. Note: The
 * array is not sorted.
 */
typedef struct
{
    unsigned int val1;
    unsigned int val2;
} values_t;

values_t TwoSum(unsigned int* arr, size_t size, unsigned int target,
                unsigned int max)
{
    unsigned int i = 0;
    values_t values = {0, 0};
    size_t* lut = (size_t*)calloc(max, sizeof(unsigned int));
    if (NULL == lut)
    {
        return values;
    }

    for (i = 0; i < size; ++i)
    {
        if (lut[target - arr[i]] == 1)
        {
            values.val1 = arr[i];
            values.val2 = target - arr[i];
            free(lut);

            return values;
        }
        lut[arr[i]] = 1;
    }

    free(lut);

    return values;
}
/*
3.
Implement a “find” function that receives an array of chars and the size of the
array. The function checks whether the char is in the array. You are not allowed
to use if, the ternary operator, switch-case or any logical operator (such as ==
, !=). One logical operator for a trivial loop for traversal of the array is
allowed. */
int FindCharWithLUT(char* str, size_t size, char target)
{
    size_t lut[256] = {0};
    size_t i = 0;
    while (i < size)
    {
        lut[(size_t)str[i]] += 1;
        ++i;
    }

    return lut[(size_t)target];
}

int FindCharWithBitwise(char* str, size_t size, char target)
{
    size_t i = 0;
    unsigned char found = 0;
    unsigned char diff = 0;

    for (; i < size; ++i)
    {
        /* diff = 0 if equal, non-zero otherwise */
        diff = (unsigned char)(str[i] - target);

        /* if diff==0, then diff|-diff has MSB 0; otherwise MSB=1 */
        found |= (unsigned char)(((diff | (-diff)) >> 7) ^ 1);
    }

    return found;
}
/* 4.Given an array of chars, write a function that performs an efficient n
 * bytes circular shift in-place (don’t do a 1 circular shift n times). */
#include <stddef.h>

static void SwapChar(char* a, char* b)
{
    char t = *a;
    *a = *b;
    *b = t;
}

static void Reverse(char* arr, size_t left, size_t right)
{
    while (left < right)
    {
        SwapChar(&arr[left], &arr[right]);
        ++left;
        --right;
    }
}

void RotateRight(char* arr, size_t n, size_t k)
{
    if (0 == n)
    {
        return;
    }
    k %= n;
    if (0 == k)
    {
        return;
    }

    Reverse(arr, 0, n - 1);
    Reverse(arr, 0, k - 1);
    Reverse(arr, k, n - 1);
}

/* 5.
Given a 2D bitmap of 1s and 0s where 0 represents sea and 1 represents shore.
Implement a function finding how many islands the map contains.

Note:

Every continuous area of 1’s is an island.

1’s that touch the edge of the bitmap are also considered to be an island.

One 1 (with no 1 neighbors) is also an island.

1 continuum is considered to be the same island in all directions, including
diagonally.

You may implement it using a plain 2D array or bitwise operations. */
#include <q.h>
typedef struct point
{
    size_t row;
    size_t col;
} point_t;

int directions[8][2] = {{-1, -1}, {-1, 0}, {-1, 1}, {0, -1},
                        {0, 1},   {1, -1}, {1, 0},  {1, 1}};
int BFS(int** bitmap, queue_t* queue, size_t rows, size_t cols,
        size_t start_row, size_t start_col);

int CountIslands(int* bitmap[], size_t rows, size_t cols)
{
    size_t i = 0, j = 0;
    size_t island_count = 0;

    queue_t* queue = QCreate();
    if (NULL == queue)
    {
        perror("QCreate failed");
        return -1;
    }

    for (i = 0; i < rows; ++i)
    {
        for (j = 0; j < cols; ++j)
        {
            if (bitmap[i][j] == 1)
            {
                ++island_count;
                if (BFS(bitmap, queue, rows, cols, i, j))
                {
                    QDestroy(queue);
                    perror("BFS failed");
                    return -1;
                }
            }
        }
    }
    QDestroy(queue);

    return island_count;
}

int BFS(int** bitmap, queue_t* queue, size_t rows, size_t cols,
        size_t start_row, size_t start_col)
{
    point_t curr = {0};
    point_t new_point = {0};
    size_t tmp = 0;
    size_t new_row = 0;
    size_t new_col = 0;
    size_t i = 0;

    size_t encoded_data = start_row << 16 | start_col;

    if (QEnqueue(queue, (void*)encoded_data))
    {
        printf("QEnqueue failed\n");
        return 1;
    }
    bitmap[start_row][start_col] = 0;

    while (!QIsEmpty(queue))
    {
        tmp = (int)QPeek(queue);
        QDequeue(queue);

        curr.row = (int)(tmp >> 16);
        curr.col = (int)(tmp & 0xFFFF);
        for (i = 0; i < 8; ++i)
        {
            new_row = curr.row + directions[i][0];
            new_col = curr.col + directions[i][1];

            if (new_row < rows && new_col < cols &&
                bitmap[new_row][new_col] == 1)
            {
                bitmap[new_row][new_col] = 0;
                encoded_data = (new_row << 16) | new_col;
                if (QEnqueue(queue, (void*)encoded_data))
                {
                    printf("QEnqueue failed");
                    return 1;
                }
            }
        }
    }

    return 0;
}
/* 6.
We use a stack for saving our data – “data_stack”. Design a stack “min_stack”
which allows us to get the minimum value of “data_stack” in O(1).

Note:

“data_stack” is a fully featured stack as previously implemented in the lab.

Your task is to develop the “min_stack” data structure (Push, Peek, Pop, GetMin)
– You can use the “data_stack” API.

“min_stack”’s Push(), Peek(), Pop() and GetMin() are required to be O(1).

Assume the data element type in the stack is int.

There is no need to write the “min_stack”’s Create() / Destroy() functions.

Do declare the “min_stack”’s management struct. */

#include "limits.h"
#include "stack.h"

typedef struct min_stack
{
    stack_t* st;
    int min;
} min_stack_t;

int Push(min_stack_t* mstack, int pushed)
{
    int val = pushed;

    assert(mstack);

    if (StackIsEmpty(mstack->st))
    {
        mstack->min = pushed;
    }
    else if (pushed < mstack->min)
    {
        val = 2 * pushed - mstack->min;
        mstack->min = pushed;
    }

    return StackPush(mstack->st, &val);
}

int Peek(min_stack_t* mstack)
{
    int top = 0;

    assert(mstack);
    assert(!StackIsEmpty(mstack->st));

    top = *(int*)StackPeek(mstack->st);

    if (top < mstack->min) /* if the top is less than the min, return the min */
    {
        return mstack->min;
    }

    return top;
}

void Pop(min_stack_t* mstack)
{
    int top = 0;

    assert(mstack);
    assert(!StackIsEmpty(mstack->st));

    top = *(int*)StackPeek(mstack->st);

    if (top < mstack->min)
    {
        mstack->min = 2 * mstack->min - top;
    }

    StackPop(mstack->st, 0);

    if (StackIsEmpty(mstack->st))
    {
        mstack->min = INT_MAX;
    }
}

int GetMin(min_stack_t* mstack)
{
    assert(mstack);

    return (mstack->min);
}
/* 7.
Write a function that receives a string, checks whether its parentheses ( (),
[], {}, <> ) are arranged correctly, and returns 0 or 1.

For example:

"(x + 3 * [4 + 6]) <" → would return 1

"(8 ]* (6 + 2) + 1)" → would return 0

"[(8 ]* (6 + 2) + 1)" → would return 0 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include <stddef.h>
#include <limits.h>
#include <stack.h>
#include <q.h>

int CheckParentheses(const char* str)
{
    size_t i = 0;
    char popped = 0;

    size_t len = strlen(str);
    stack_t* stack = StackCreate(len, sizeof(char));
    if (!stack)
    {
        return 0;
    }

    for (i = 0; i < len; ++i)
    {
        if (str[i] == '(' || str[i] == '[' || str[i] == '{' || str[i] == '<')
        {
            StackPush(stack, &str[i]);
        }
        else if (str[i] == ')' || str[i] == ']' || str[i] == '}' || str[i] == '>')
        {
            if (StackIsEmpty(stack))
            {
                StackDestroy(stack);
                return 0;
            }
            popped = *(char*)StackPeek(stack);
            StackPop(stack, 0);
            if ((str[i] == ')' && popped != '(') ||
                (str[i] == ']' && popped != '[') ||
                (str[i] == '}' && popped != '{') ||
                (str[i] == '>' && popped != '<'))
            {
                StackDestroy(stack);
                return 0;
            }
        }
    }

    if (!StackIsEmpty(stack))
    {
        StackDestroy(stack);
        return 0;
    }

    StackDestroy(stack);
    return 1;
}
/* 8.
Recursion:

a. Give an example of a recursive function. What happens if you don’t write a
stop condition?

b. Write a recursive function which does arithmetic operations such as
multiplication and division of two integers without using * or /.

Note:

Implement multiplication or division (no need for both).

Usage of * and / is not allowed. Usage of + and - is allowed.

Assume the unsigned int argument/s.
*/
unsigned int Multiply(unsigned int a, unsigned int b)
{
    if (0 == b || a == 0)
    {
        return 0;
    }

    return a + Multiply(a, b - 1);
}
/*
c. Write a recursive function which receives an integer and returns its argument
incremented by 1. You may not use addition.

Note:

You may not use the +, - operators.

You may assume unsigned int argument/s. */
unsigned int Inc2(unsigned int x)
{
    /* if LSB is 0 -> set it to 1 */
    /* else -> clear LSB and recurse on higher bits */
    unsigned int lsb = x & 1u;
    unsigned int add = lsb ^ 1u; /* 1 if lsb==0 else 0 */
    unsigned int shifted = x >> 1;
    unsigned int rec = lsb ? Inc2(shifted) : shifted;
    return (rec << 1) | add;
}

unsigned int Inc(unsigned int num, unsigned int carry)
{
    int local = 0;

    if(carry == 0)
    {
        return num;
    }

    local = (num & carry);
    num = (num ^ carry);
    
    return Inc(num, local << 1);
}
/*

9.
Sort:

a. Which sorting algorithms do you know? Specify the average time complexity and
memory complexity for each.

b. What is a stable sort? Which sorts are stable?

c. Write a function that receives a doubly linked list and a pivot value x, and
arranges the linked list according to the pivot (the pivot does not have to be
equal to one of the list’s elements). Each value bigger or equal to x will
appear after x, and every value smaller will appear before x.
*/
#include <assert.h>
#include <stddef.h>

typedef struct dnode
{
    int data;
    struct dnode* prev;
    struct dnode* next;
} dnode_t;

typedef struct dll
{
    dnode_t* head;
    dnode_t* tail;
} dll_t;

static void AppendNode(dnode_t** h, dnode_t** t, dnode_t* n)
{
    assert(h && t && n);

    n->prev = *t;
    n->next = NULL;

    if (*t)
    {
        (*t)->next = n;
    }
    else
    {
        *h = n;
    }

    *t = n;
}

void DLL_PartitionByPivot(dll_t* list, int x)
{
    dnode_t* cur = NULL;
    dnode_t* next = NULL;

    dnode_t *less_h = NULL, *less_t = NULL;
    dnode_t *ge_h = NULL, *ge_t = NULL;

    assert(list);

    cur = list->head;
    while (cur)
    {
        next = cur->next;

        cur->prev = NULL;
        cur->next = NULL;

        if (cur->data < x)
        {
            AppendNode(&less_h, &less_t, cur);
        }
        else
        {
            AppendNode(&ge_h, &ge_t, cur);
        }

        cur = next;
    }

    if (less_t)
    {
        less_t->next = ge_h;
        if (ge_h)
        {
            ge_h->prev = less_t;
        }
        list->head = less_h;
        list->tail = ge_t ? ge_t : less_t;
    }
    else
    {
        list->head = ge_h;
        list->tail = ge_t;
    }
}
/*
d. You are given 100K text files. Each has a sorted array of 10 numbers.
Your goal is to combine all 100K arrays into one sorted array.

What sorting algorithm would you choose? Why?

What is the bottleneck in the program? (A bottleneck is the point where the
software is severely slowed down. Improving it will result in a high performance
gain.) */
/*

10.Given a dictionary, find a quick way to find all anagrams of a given word,
that are valid dictionary words. For example, live, vile, veil, and evil are
anagrams which are valid. ievl is not.

API:

// Prints all anagrams of word which are valid dictionary words: void
PrintAllAnagramsDictionaryWords(char* word){/.../}

You can prepare any required code or data structure in advance.

Note: Clear pseudo-code is enough. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include <stddef.h>
#include <limits.h>
#include <stack.h>
#include <q.h>

/*
 * SOLUTION:
 * 
 * Data Structure: Hash table where:
 *   - Key: sorted version of each word (e.g., "live" -> "eilv")
 *   - Value: list of all dictionary words that are anagrams
 *
 * PRE-PROCESSING (done once before queries):
 * 
 *   hash_table = CreateHashTable()
 *   
 *   FOR each word in dictionary:
 *       sorted_key = SortCharacters(word)  // e.g., "live" -> "eilv"
 *       
 *       anagram_list = HashTableFind(hash_table, sorted_key)
 *       IF anagram_list == NULL:
 *           anagram_list = CreateNewList()
 *           HashTableInsert(hash_table, sorted_key, anagram_list)
 *       
 *       AddToList(anagram_list, word)
 *
 * QUERY FUNCTION:
 * 
 *   void PrintAllAnagramsDictionaryWords(char* word)
 *   {
 *       sorted_key = SortCharacters(word)
 *       anagram_list = HashTableFind(hash_table, sorted_key)
 *       
 *       IF anagram_list != NULL:
 *           FOR each dict_word in anagram_list:
 *               IF dict_word != word:  // Don't print input word itself
 *                   PRINT dict_word
 *   }
 *
 * TIME COMPLEXITY:
 *   Pre-processing: O(n * m * log(m)) where n = dict size, m = avg word length (sorting each word) and populating the HashTable
 *   Query: O(m * log(m)) for sorting + O(1) avg lookup + O(k) to print k anagrams
 *   Space: O(n * m) for storing dictionary
 *
 * EXAMPLE:
 *   Dictionary: ["live", "vile", "veil", "evil", "hello"]
 *   After pre-processing:
 *     "eilv" -> ["live", "vile", "veil", "evil"]
 *     "ehllo" -> ["hello"]
 *   
 *   Query: PrintAllAnagramsDictionaryWords("live")
 *   - Sort("live") = "eilv"
 *   - Lookup "eilv" -> ["live", "vile", "veil", "evil"]
 *   - Print: "vile", "veil", "evil" (excluding "live")
 */
/*
11.Design the data structures and interfaces for a hash table:

a. Write the interface for a hash table (API only, no implementation). b.
Describe the time complexity of the relevant functions. c. Give an example of
when you would use a hash table. */

typedef size_t (*hash_func_t)(const void* key);
typedef int (*cmp_func_t)(const void* key1, const void* key2);

typedef struct hash_table
{
    dll_t* buckets;
    size_t size;
    hash_func_t hash_func;
    cmp_func_t cmp_func;
} hash_table_t;

/* T: O(1) average case
    S: O(n) */
hash_table_t* HashTableCreate(size_t size, hash_func_t hash_func,
                              cmp_func_t cmp_func);

/* T: O(1) average case
    S: O(n) */
void HashTableDestroy(hash_table_t* table);

/* T: O(1) average case
    S: O(1) */
int HashTableInsert(hash_table_t* table, const void* key, const void* value);

/* T: O(1) average case
    S: O(1) */
void* HashTableFind(const hash_table_t* table, const void* key);

/* T: O(1) average case
    S: O(1) */
void HashTableRemove(hash_table_t* table, const void* key);

/*
12.
Design the data structures and interfaces for a heap:

typedef struct heap
{
    int* arr;
    size_t size;
    size_t capacity;
} heap_t;

heap_t* HeapCreate(size_t capacity);

void HeapDestroy(heap_t* heap);

void HeapPush(heap_t* heap, int data);

void HeapPop(heap_t* heap);

int HeapIsEmpty(const heap_t* heap);

int HeapIsFull(const heap_t* heap);

int HeapSize(const heap_t* heap);

int HeapCapacity(const heap_t* heap);

int HeapPeek(const heap_t* heap);

int HeapPop(heap_t* heap);

int HeapPush(heap_t* heap, int data);

int HeapIsEmpty(const heap_t* heap);

int HeapIsFull(const heap_t* heap);

int HeapSize(const heap_t* heap);

int HeapCapacity(const heap_t* heap);

int HeapPeek(const heap_t* heap);

a. Describe the purpose of the heap data structure. Give an example of when you
would use it. b. Write the interface for a heap (API only, no implementation).
c. Describe the time complexity of the relevant functions. */
/*
13.
Binary tree, binary search, IP:

a. Implement an iterative and recursive insertion to a binary tree.

b. What is the complexity of insert to a binary search tree?

c. In the IPv4 protocol, the IP address belongs to some geographical region, and
its format is: xxx.xxx.xxx.xxx

For example:

All IP addresses between 10.7.8.10 and 10.7.20.250 belong to Eilat, Israel.
Thus 10.7.13.62 is an address in Eilat, Israel.

IP addresses between 10.8.9.9 and 10.8.20.40 belong to Rishon-Le-Zion, Israel.

Offer a way to store the data, so that given an IP address, you can efficiently
discover which city it belongs to.

Note for c:

A clear explanation with diagrams and pseudo code is enough. */
/*
14.
You are given a map of roads and cities.
A road is always straight, has a length, and connects two cities,
bi-directionally.

Offer a data structure to store the information about the map.

The data structure should allow an efficient search for a direct connection
between two cities, to be used by algorithms for solving the shortest path
problem.
 */
#include <stdio.h>

int main()
{
    /*
    int i = 0;
    int j = 0;
    int* bitmap_ptrs[10];
    int bitmap[10][10] = {
        {1, 1, 0, 0, 0, 1, 0, 0, 1, 1}, {1, 1, 0, 0, 0, 0, 0, 0, 0, 0},
        {0, 0, 0, 1, 1, 0, 0, 1, 1, 0}, {0, 0, 0, 1, 1, 0, 0, 0, 0, 0},
        {1, 0, 0, 0, 0, 0, 1, 1, 0, 0}, {1, 1, 0, 0, 1, 1, 1, 1, 0, 0},
        {0, 0, 0, 0, 0, 0, 0, 0, 1, 1}, {0, 1, 1, 0, 0, 1, 1, 0, 1, 1},
        {0, 0, 0, 0, 0, 0, 0, 0, 0, 0}, {1, 1, 0, 1, 1, 0, 1, 1, 0, 1}};

    int zero_bitmap[10][10] = {
        {0, 0, 0, 0, 0, 0, 0, 0, 0, 0}, {0, 0, 0, 0, 0, 0, 0, 0, 0, 0},
        {0, 0, 0, 0, 0, 0, 0, 0, 0, 0}, {0, 0, 0, 0, 0, 0, 0, 0, 0, 0},
        {0, 0, 0, 0, 0, 0, 0, 0, 0, 0}, {0, 0, 0, 0, 0, 0, 0, 0, 0, 0},
        {0, 0, 0, 0, 0, 0, 0, 0, 0, 0}, {0, 0, 0, 0, 0, 0, 0, 0, 0, 0},
        {0, 0, 0, 0, 0, 0, 0, 0, 0, 0}, {0, 0, 0, 0, 0, 0, 0, 0, 0, 0}};

    for (i = 0; i < 10; ++i)
    {
        bitmap_ptrs[i] = zero_bitmap[i];
        for (j = 0; j < 10; ++j)
        {
            printf("%d ", zero_bitmap[i][j]);
        }
        printf("\n");
    }

    printf("There are %d islands in the bitmap.\n",
           CountIslands(bitmap_ptrs, 10, 10));
           */

           /*
    min_stack_t* mstack = (min_stack_t*)malloc(sizeof(min_stack_t));
    if (!mstack)
    {
        return 1;
    }

    mstack->st = StackCreate(100,sizeof(int*));
    if(!mstack->st)
    {
        return 1;
    }

    mstack->min = INT_MAX;

    Push(mstack,3);
    printf("pushed 3, min: %d, peek: %d\n", GetMin(mstack), Peek(mstack));
    Push(mstack,2);
    printf("pushed 2, min: %d, peek: %d\n", GetMin(mstack), Peek(mstack));
    Push(mstack,1);
    printf("pushed 1, min: %d, peek: %d\n", GetMin(mstack), Peek(mstack));
    Pop(mstack);
    printf("popped 1, min: %d, peek: %d\n", GetMin(mstack), Peek(mstack));
    Pop(mstack);
    printf("popped 2, min: %d, peek: %d\n", GetMin(mstack), Peek(mstack));
    Pop(mstack);
    printf("popped 3, min: %d", GetMin(mstack));
    
    StackDestroy(mstack->st);
    free(mstack);
    */

        printf("%d\n", Inc(422, 1));
  
    return 0;
}