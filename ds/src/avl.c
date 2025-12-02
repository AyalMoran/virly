/**************************************************************
 *  File        : avl.c
 *  Author      : Ayal Moran
 *  Reviewer    :
 *  Date        : 01-12-2025
 **************************************************************/

#include <assert.h> /* assert */
#include <stddef.h> /* size_t   */
#include <stdlib.h> /* malloc */
#include <string.h> /* memset */

#ifndef NDEBUG
#    include <stdio.h>
#endif /* !NDEBUG */

/*============================ INCLUDES ============================*/
#include "avl.h"

/*========================== DEFINITIONS ===========================*/
#define TRUE (1)
#define FALSE (0)

#define SUCCESS (0)
#define FAILURE (1)

/*========================== MACRO UTILS ===========================*/
#define LEFT_CHILD_OF(node) ((node)->children[LEFT])
#define RIGHT_CHILD_OF(node) ((node)->children[RIGHT])
#define MAX(a, b) ((a) < (b) ? (b) : (a))
#define NODE_HAS_AT_MOST_ONE_CHILD(node)                                       \
    ((NULL == (node)->children[LEFT]) || (NULL == (node)->children[RIGHT]))

/*========================= TYPEDEFS/ENUMS =========================*/
typedef enum child
{
    LEFT,
    RIGHT,
    NUM_OF_CHILDREN
} child_t;

typedef struct node_tree
{
    void* data;
    struct node_tree* children[NUM_OF_CHILDREN];
    ssize_t height;
} node_tree_t;

struct AVL
{
    node_tree_t* root;
    avl_cmp_t cmp;
};
/*====================== STATIC DECLARATIONS =======================*/

static void DestroySubTree(node_tree_t* to_destroy);

static node_tree_t* CreateNode(const void* data);
static void InitNode(node_tree_t* node, const void* data, node_tree_t* left,
                     node_tree_t* right);

static node_tree_t* RecInsert(node_tree_t* node, avl_cmp_t cmp,
                              const void* to_insert);
static void InsertCompareAndRecurse(avl_cmp_t cmp, const void* data,
                                    node_tree_t* node);

static node_tree_t* RecInsertNoBalance(node_tree_t* node, avl_cmp_t cmp,
                                       const void* data);

static node_tree_t* RecRemove(node_tree_t* subroot, avl_cmp_t cmp,
                              const void* data_to_remove, void** found_object);
static void* RecRemoveNoBalance(node_tree_t* node, avl_cmp_t cmp,
                                void* data_to_remove, void** found_object);
static node_tree_t* RemoveNodeWithZeroOrOneChild(node_tree_t* node);

static node_tree_t* RemoveNodeWithTwoChildren(node_tree_t* node, avl_cmp_t cmp);
static node_tree_t* BSTRemoveNodeWithTwoChildren(node_tree_t* node,
                                                 avl_cmp_t cmp);

static int RecForEach(node_tree_t* node, traversal_t order,
                      int (*callback_t)(void*, void*), void* param);
static int RecForEachPre(node_tree_t* node, int (*callback)(void*, void*),
                         void* param);
static int RecForEachIn(node_tree_t* node, int (*callback)(void*, void*),
                        void* param);
static int RecForEachPost(node_tree_t* node, int (*callback)(void*, void*),
                          void* param);

static node_tree_t* RecFind(node_tree_t* subroot, avl_cmp_t cmp,
                            const void* to_find);

static node_tree_t* Rotate(node_tree_t* node);
static node_tree_t* RotateLeft(node_tree_t* to_rotate);
static node_tree_t* RotateRight(node_tree_t* to_rotate);

static void UpdateHeight(node_tree_t* node);
static size_t GetHeight(const node_tree_t* node);
static int GetBalanceFactor(node_tree_t* node);
static int IsRightHeavy(int bf);
static int IsLeftHeavy(int bf);

static node_tree_t* GetMinNode(const node_tree_t* node);
static int CountHelper(void* data, void* param);

/*========================= API FUNCTIONS ==========================*/
avl_t* AVLCreate(avl_cmp_t cmp)
{
    avl_t* tree = NULL;

    assert(NULL != cmp);

    tree = (avl_t*) malloc(sizeof(avl_t));
    if (NULL == tree)
    {
        return NULL;
    }

    tree->cmp = cmp;
    tree->root = NULL;

    return tree;
}

void AVLDestroy(avl_t* tree)
{
    assert(NULL != tree);

    DestroySubTree(tree->root);

    free(tree);

    return;
}

int AVLInsert(avl_t* tree, const void* data)
{
    node_tree_t* node = NULL;

    assert(NULL != tree);

    node = RecInsert(tree->root, tree->cmp, data);
    if (NULL == node)
    {
        return AVL_FAILURE;
    }

    tree->root = node;

    return AVL_SUCCESS;
}

void* AVLRemove(avl_t* tree, void* data)
{
    void* to_return = NULL;

    assert(NULL != tree);

    tree->root = RecRemove(tree->root, tree->cmp, data, &to_return);
    return to_return;
}

int AVLIsEmpty(const avl_t* tree)
{
    return NULL == tree->root;
}

size_t AVLSize(const avl_t* tree)
{
    size_t count = 0;

    assert(NULL != tree);

    AVLForEach((avl_t*) tree, CountHelper, IN_ORDER, &count);

    return count;
}

size_t AVLHeight(const avl_t* tree)
{
    if(AVLIsEmpty(tree))
    {
       return 0; 
    }
    return tree->root->height;
}

void* AVLFind(const avl_t* tree, const void* data)
{
    node_tree_t* found = NULL;

    assert(NULL != tree);

    found = RecFind(tree->root, tree->cmp, data);

    return found->data;
}

int AVLForEach(avl_t* tree, avl_callback_t callback, traversal_t order,
               void* param)
{
    assert(NULL != tree);
    assert(2 >= order);
    assert(order >= 0);
    assert(NULL != callback);

    RecForEach(tree->root, order, callback, param);

    return SUCCESS;
}

int BSTInsertRec(avl_t* tree, const void* data)
{
    node_tree_t* new_node = NULL;

    assert(tree);

    new_node = RecInsertNoBalance(tree->root, tree->cmp, data);
    tree->root = new_node ? new_node : tree->root;

    return NULL == new_node;
}

void* BSTRemoveRec(avl_t* tree, void* data)
{
    void* found = NULL;

    assert(NULL != tree);

    tree->root = RecRemoveNoBalance(tree->root, tree->cmp, data, &found);
    return found;
}

/*======================= STATIC FUNCTIONS ========================*/
/*==========  Static defs  ==========*/
static void DestroySubTree(node_tree_t* subroot)
{
    if (NULL == subroot)
    {
        return;
    }

    DestroySubTree(RIGHT_CHILD_OF(subroot));
    DestroySubTree(LEFT_CHILD_OF(subroot));
    free(subroot);
}

static node_tree_t* CreateNode(const void* data)
{
    node_tree_t* node = (node_tree_t*) malloc(sizeof(node_tree_t));
    if (NULL == node)
    {
        return NULL;
    }

    InitNode(node, data, NULL, NULL);

    return node;
}

static void InitNode(node_tree_t* node, const void* data, node_tree_t* left,
                     node_tree_t* right)
{
    assert(NULL != node);

    node->data = (void*) data;
    node->height = 1;
    node->children[LEFT] = left;
    node->children[RIGHT] = right;
}

static node_tree_t* RecInsert(node_tree_t* node, avl_cmp_t cmp,
                              const void* data)
{
    assert(NULL != cmp);

    if (NULL == node)
    {
        return CreateNode(data);
    }

    InsertCompareAndRecurse(cmp, data, node);

    UpdateHeight(node);

    return Rotate(node);
}

static void InsertCompareAndRecurse(avl_cmp_t cmp, const void* data,
                                    node_tree_t* node)
{
    int direction = 0;

    assert(NULL != cmp);
    assert(NULL != node);

    direction = cmp(data, node->data);
    node->children[0 < direction] =
        RecInsert(node->children[0 < direction], cmp, data);
}

static node_tree_t* RecInsertNoBalance(node_tree_t* node, avl_cmp_t cmp,
                                       const void* data)
{
    node_tree_t* new_node = NULL;
    int direction = 0;

    assert(NULL != cmp);

    if (NULL == node)
    {
        return CreateNode(data);
    }

    direction = 0 > cmp(node->data, data);

    new_node = RecInsertNoBalance(node->children[direction], cmp, data);
    if (NULL == new_node)
    {
        return NULL;
    }
    node->children[direction] = new_node;

    UpdateHeight(node);

    return node;
}

static void* RecRemoveNoBalance(node_tree_t* node, avl_cmp_t cmp,
                                void* data_to_remove, void** found_object)
{
    int direction = 0;

    assert(NULL != cmp);
    assert(NULL != found_object);

    if (NULL == node)
    {
        return NULL;
    }

    direction = cmp(data_to_remove, node->data);

    if (direction != 0)
    {
        node->children[0 < direction] = RecRemoveNoBalance(
            node->children[0 < direction], cmp, data_to_remove, found_object);
    }
    else
    {
        *found_object = node->data;

        if (NODE_HAS_AT_MOST_ONE_CHILD(node))
        {
            node = RemoveNodeWithZeroOrOneChild(node);
        }
        else
        {
            node = BSTRemoveNodeWithTwoChildren(node, cmp);
        }
    }

    UpdateHeight(node);

    return node;
}

static node_tree_t* RemoveNodeWithZeroOrOneChild(node_tree_t* node)
{
    node_tree_t* child = NULL;

    assert(NULL != node);

    child = (NULL != LEFT_CHILD_OF(node)) ? LEFT_CHILD_OF(node)
                                          : RIGHT_CHILD_OF(node);

    free(node);

    return child;
}

static node_tree_t* BSTRemoveNodeWithTwoChildren(node_tree_t* node,
                                                 avl_cmp_t cmp)
{
    node_tree_t* successor = NULL;
    void* dummy = NULL;

    assert(NULL != node);
    assert(NULL != cmp);

    successor = GetMinNode(RIGHT_CHILD_OF(node));

    node->data = successor->data;

    RIGHT_CHILD_OF(node) =
        RecRemoveNoBalance(RIGHT_CHILD_OF(node), cmp, successor->data, &dummy);

    return node;
}

static node_tree_t* RemoveNodeWithTwoChildren(node_tree_t* node, avl_cmp_t cmp)
{
    node_tree_t* successor = NULL;
    void* dummy = NULL;

    assert(NULL != node);
    assert(NULL != cmp);

    successor = GetMinNode(RIGHT_CHILD_OF(node));

    node->data = successor->data;

    RIGHT_CHILD_OF(node) =
        RecRemove(RIGHT_CHILD_OF(node), cmp, successor->data, &dummy);

    return node;
}

static node_tree_t* RecRemove(node_tree_t* node, avl_cmp_t cmp,
                              const void* data_to_remove, void** found_object)
{
    int direction = 0;

    assert(NULL != cmp);
    assert(NULL != found_object);

    if (NULL == node)
    {
        return NULL;
    }

    direction = cmp(data_to_remove, node->data);

    if (direction != 0)
    {
        node->children[0 < direction] = RecRemove(
            node->children[0 < direction], cmp, data_to_remove, found_object);
    }
    else
    {
        *found_object = node->data;

        if (NODE_HAS_AT_MOST_ONE_CHILD(node))
        {
            return RemoveNodeWithZeroOrOneChild(node);
        }
        else
        {
            node = RemoveNodeWithTwoChildren(node, cmp);
        }
    }

    UpdateHeight(node);

    return Rotate(node);
}

static node_tree_t* RecFind(node_tree_t* node, avl_cmp_t cmp,
                            const void* to_find)
{
    int direction = 0;

    assert(NULL != cmp);

    if (NULL == node)
    {
        return NULL;
    }

    direction = cmp(to_find, node->data);

    if (0 == direction)
    {
        return node;
    }
    else
    {
        return RecFind(node->children[0 < direction], cmp, to_find);
    }
}

static int RecForEachPre(node_tree_t* node, int (*callback)(void*, void*),
                         void* param)
{
    int status = 0;

    assert(NULL != callback);

    if (NULL == node)
    {
        return 0;
    }

    if (0 != (status = callback(node->data, param)))
    {
        return status;
    }

    if (0 != (status = RecForEachPre(LEFT_CHILD_OF(node), callback, param)))
    {
        return status;
    }

    return RecForEachPre(RIGHT_CHILD_OF(node), callback, param);
}

static int RecForEachIn(node_tree_t* node, int (*callback)(void*, void*),
                        void* param)
{
    int status = 0;

    assert(NULL != callback);

    if (NULL == node)
    {
        return 0;
    }

    if (0 != (status = RecForEachIn(LEFT_CHILD_OF(node), callback, param)))
    {
        return status;
    }

    if (0 != (status = callback(node->data, param)))
    {
        return status;
    }

    return RecForEachIn(RIGHT_CHILD_OF(node), callback, param);
}

static int RecForEachPost(node_tree_t* node, int (*callback)(void*, void*),
                          void* param)
{
    int status = 0;

    assert(NULL != callback);

    if (NULL == node)
    {
        return 0;
    }

    if (0 != (status = RecForEachPost(LEFT_CHILD_OF(node), callback, param)))
    {
        return status;
    }
    if (0 != (status = RecForEachPost(RIGHT_CHILD_OF(node), callback, param)))
    {
        return status;
    }

    return callback(node->data, param);
}

static int RecForEach(node_tree_t* node, traversal_t order,
                      int (*callback_t)(void*, void*), void* param)
{
    assert(NULL != callback_t);
    assert(order <= 2);
    assert(order >= 0);


    switch (order)
    {
    case PRE_ORDER:
        return RecForEachPre(node, callback_t, param);
    case IN_ORDER:
        return RecForEachIn(node, callback_t, param);
    default:
        return RecForEachPost(node, callback_t, param);
    }
}

static size_t GetHeight(const node_tree_t* node)
{
    return (NULL == node) ? 0 : node->height;
}

static void UpdateHeight(node_tree_t* node)
{
    size_t left = 0;
    size_t right = 0;

    if (NULL == node)
    {
        return;
    }

    left = GetHeight(LEFT_CHILD_OF(node));
    right = GetHeight(RIGHT_CHILD_OF(node));

    node->height = MAX(left, right) + 1;
}

static int GetBalanceFactor(node_tree_t* node)
{
    assert(NULL != node);

    return GetHeight(LEFT_CHILD_OF(node)) - GetHeight(RIGHT_CHILD_OF(node));
}

static node_tree_t* Rotate(node_tree_t* node)
{
    int bf = 0;

    assert(NULL != node);

    bf = GetBalanceFactor(node);

    if (IsLeftHeavy(bf))
    {
        if (0 > GetBalanceFactor(LEFT_CHILD_OF(node)))
        {
            LEFT_CHILD_OF(node) = RotateLeft(LEFT_CHILD_OF(node));
        }

        return RotateRight(node);
    }
    if (IsRightHeavy(bf))
    {
        if (0 < GetBalanceFactor(RIGHT_CHILD_OF(node)))
        {
            RIGHT_CHILD_OF(node) = RotateRight(RIGHT_CHILD_OF(node));
        }

        return RotateLeft(node);
    }

    return node;
}

static int IsLeftHeavy(int bf)
{
    return bf > 1;
}

static int IsRightHeavy(int bf)
{
    return bf < -1;
}

static node_tree_t* RotateLeft(node_tree_t* node)
{
    node_tree_t* child = NULL;
    node_tree_t* grandchild = NULL;

    assert(NULL != node);

    child = RIGHT_CHILD_OF(node);
    grandchild = LEFT_CHILD_OF(child);

    LEFT_CHILD_OF(child) = node;
    RIGHT_CHILD_OF(node) = grandchild;

    UpdateHeight(node);
    UpdateHeight(child);

    return child;
}

static node_tree_t* RotateRight(node_tree_t* node)
{
    node_tree_t* child = NULL;
    node_tree_t* grandchild = NULL;

    assert(NULL != node);

    child = LEFT_CHILD_OF(node);
    grandchild = RIGHT_CHILD_OF(child);

    RIGHT_CHILD_OF(child) = node;
    LEFT_CHILD_OF(node) = grandchild;

    UpdateHeight(node);
    UpdateHeight(child);

    return child;
}

static node_tree_t* GetMinNode(const node_tree_t* node)
{
    assert(NULL != node);

    while (NULL != LEFT_CHILD_OF(node))
    {
        node = LEFT_CHILD_OF(node);
    }

    return (node_tree_t*) node;
}

static int CountHelper(void* data, void* param)
{
    *(size_t*) param += 1;

    (void) data;
    return 0;
}

#ifndef NDEBUG
/*=======================  Debug  =======================*/
static void AVLPrintRec(const node_tree_t* node, int lvl,
                        void (*print_func)(const void*))
{
    int i = 0;

    assert(print_func);

    if (NULL == node)
    {
        return;
    }

    AVLPrintRec(RIGHT_CHILD_OF(node), lvl + 1, print_func);

    for (; i < lvl; ++i)
    {
        printf("        ");
    }

    printf("(");
    print_func(node->data);
    printf(", h=%ld)\n", (long) node->height);

    AVLPrintRec(LEFT_CHILD_OF(node), lvl + 1, print_func);
}

void AVLPrint(const avl_t* tree, void (*print_func)(const void*))
{
    assert(NULL != tree);
    assert(print_func);

    AVLPrintRec(tree->root, 0, print_func);
}
#endif /* NDEBUG */