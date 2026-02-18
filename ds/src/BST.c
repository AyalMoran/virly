
#include <assert.h> /* assert      */
#include <stdint.h> /* int32_t     */
#include <stdlib.h> /* malloc      */

#ifndef NDEBUG
#include <stdio.h>
#endif /*NDEBUG*/

#include "BST.h"/* bst_t       */
#define MAX(a, b) ((a) < (b) ? (b) : (a))

struct bst
{
    node_t* dummy;
    int (*cmp_func)(const void* val1, const void* val2);
};

enum child
{
    LEFT = 0,
    RIGHT,
    NUM_OF_CHILDREN
};

enum replace_direction
{
    FROM_SUCCESSOR,
    FROM_PREDECESSOR
};
typedef enum replace_direction replace_dir_t;

struct node
{
    void* data;
    node_t* parent;
    node_t* children[NUM_OF_CHILDREN];
};

#pragma region Helper Functions
/* ============================================================ */
static node_t* IterToNode(bst_iter_t iter);
static bst_iter_t NodeToIter(node_t* node);
static node_t* GetParent(const node_t* node);
static void SetParent(node_t* node, node_t* new_parent);
static node_t* GetLeftChild(const node_t* node);
static node_t* GetRightChild(const node_t* node);
static node_t* GetChild(const node_t* node, int child);
static void SetLeftChild(node_t* node, node_t* new_child);
static void SetRightChild(node_t* node, node_t* new_child);
static void SetChild(node_t* node, int child, node_t* new_child);
static void SetData(node_t* node, void* new_data);
static void* GetData(const node_t* node);
static int CompareNodes(const bst_t* tree, const void* data1,
                        const void* data2);
static int IsDummyNode(const node_t* node);
static void GetMinNode(node_t** node);
static void GoRightAsMuchAsYouCan(node_t** node);
static int IsLeaf(const node_t* node);
static int IsRightChild(const node_t* node);
static int IsLeftChild(const node_t* node);
static size_t GetHeight(const node_t* node);
static node_t* CreateNode(node_t* left_child, node_t* right_child,
                          node_t* parent, void* data);
static int CountFunc(void* data, void* param);
static void UnlinkNode(node_t* replacement, replace_dir_t source);
static void TransplantNode(node_t* parent, const node_t* node,
                           node_t* replacement);
#pragma endregion

/* ============================================================ */
bst_t* BSTCreate(int (*cmp_func)(const void* val1, const void* val2))
{
    bst_t* tree = NULL;
    int data = INT32_MAX;

    assert((cmp_func) && "assertion failed at __LINE__");

    tree = (bst_t*) malloc(sizeof(bst_t));
    if (NULL == tree)
    {
        return NULL;
    }

    tree->dummy = CreateNode(NULL, NULL, NULL, &data);
    if (NULL == tree->dummy)
    {
        free(tree);
        return NULL;
    }

    SetParent(tree->dummy, tree->dummy);
    SetRightChild(tree->dummy, tree->dummy);

    tree->cmp_func = cmp_func;

    return tree;
}

void BSTDestroy(bst_t* tree)
{
    bst_iter_t iter = 0;
    bst_iter_t next = {0};
    size_t i = 0;
    assert((tree) && "assertion failed at __LINE__");
    iter = BSTBegin(tree);

    while (!BSTIsEmpty(tree))
    {
        next = BSTNext(iter);
        BSTRemove((iter));
        iter = next;
        #ifndef NDEBUG
        printf("Remove No.%d\n", ++i);
        fflush(stdout);
        #endif /*NDEBUG*/
    }

    free(tree->dummy);
    free(tree);
}

bst_iter_t BSTInsert(bst_t* tree, void* data)
{
    node_t* parent = NULL;
    node_t* traverser = NULL;
    node_t* node = NULL;
    int direction = 0;

    assert(tree && "assertion failed");

    if (BSTIsEmpty(tree))
    {
        node = CreateNode(NULL, NULL, tree->dummy, data);
        if (NULL == node)
        {
            return BSTEnd(tree);
        }
        SetLeftChild(tree->dummy, node);
        return NodeToIter(node);
    }

    traverser = GetLeftChild(tree->dummy);
    while (NULL != traverser)
    {
        parent = traverser;
        direction = (CompareNodes(tree, (GetData(traverser)), data) < 0);
        traverser = GetChild(traverser, direction);
    }

    node = CreateNode(NULL, NULL, parent, data);
    if (NULL == node)
    {
        return BSTEnd(tree);
    }
    SetChild(parent, direction, node);

    return NodeToIter(node);
}

void BSTRemove(bst_iter_t to_remove)
{
    node_t* node = IterToNode(to_remove);
    node_t* replacement = NULL;
    node_t* parent = GetParent(node);

    assert(NULL != node);

    if (IsLeaf(node))
    {
        SetChild(parent, IsLeftChild(node) ? LEFT : RIGHT, NULL);
        free(node);
        return;
    }

    if (GetHeight(GetLeftChild(node)) < GetHeight(GetRightChild(node)))
    {
        replacement = BSTNext(to_remove);
        UnlinkNode(replacement, FROM_SUCCESSOR);
    }
    else
    {
        replacement = BSTPrev(to_remove);
        UnlinkNode(replacement, FROM_PREDECESSOR);
    }

    TransplantNode(parent, node, replacement);

    if (NULL != GetLeftChild(node))
    {
        SetParent(GetLeftChild(node), replacement);
    }

    if (NULL != GetRightChild(node))
    {
        SetParent(GetRightChild(node), replacement);
    }

    free(node);
}

bst_iter_t BSTFind(const bst_t* tree, void* data)
{
    node_t* curr = NULL;
    int direction = 0;

    assert(tree);

    curr = GetLeftChild(tree->dummy);

    while (NULL != curr &&
           0 != (direction = CompareNodes(tree, (BSTGetData(curr)), data)))
    {
        curr = GetChild(curr, (0 > direction));
    }

    return curr == NULL ? BSTEnd(tree) : NodeToIter(curr);
}

int BSTForEach(bst_iter_t from, bst_iter_t to,
               int (*action_func)(void* data, void* param),
               void* param) /* in order */
{
    int action_return_status = 0;

    assert(IterToNode(from));
    assert(IterToNode(to));
    assert(action_func);

    while (!BSTIterIsEqual(from, to) && 0 == action_return_status)
    {
        action_return_status = (action_func(GetData(from), param));
        from = BSTNext(from);
    }

    return action_return_status;
}

int BSTIsEmpty(const bst_t* tree)
{
    return (NULL == GetLeftChild(tree->dummy));
}

size_t BSTSize(const bst_t* tree)
{
    size_t count_nodes = 0;

    BSTForEach(BSTBegin(tree), BSTEnd(tree), CountFunc, &count_nodes);

    return count_nodes;
}

static int CountFunc(void* data, void* param)
{
    *(size_t*) param = *(size_t*) param + 1;
    (void) (data);

    return 0;
}

void* BSTGetData(bst_iter_t iter)
{
    assert(!IsDummyNode(IterToNode(iter)));

    return (void*) (IterToNode(iter)->data);
}

int BSTIterIsEqual(bst_iter_t iter1, bst_iter_t iter2)
{
    assert(IterToNode(iter1));
    assert(IterToNode(iter2));
    return (IterToNode(iter1) == IterToNode(iter2));
}

bst_iter_t BSTBegin(const bst_t* tree)
{
    node_t* curr = NULL;

    assert(tree);
    assert(tree->dummy);

    curr = tree->dummy;

    GetMinNode(&curr);

    return curr;
}

bst_iter_t BSTEnd(const bst_t* tree)
{
    assert(tree);
    assert(tree->dummy);

    return NodeToIter(tree->dummy);
}

bst_iter_t BSTNext(bst_iter_t iter)
{
    node_t* curr = NULL;
    node_t* parent = NULL;

    curr = IterToNode(iter);

    assert(IterToNode(iter));

    if (GetRightChild(curr))
    {
        curr = GetRightChild(curr);
        GetMinNode(&curr);
    }
    else
    {
        parent = GetParent(curr);
        while (NULL != parent && curr == GetRightChild(parent))
        {
            curr = parent;
            parent = GetParent(parent);
        }
        curr = parent;
    }

    return NodeToIter(curr);
}

bst_iter_t BSTPrev(bst_iter_t iter)
{
    node_t* curr = IterToNode(iter);
    node_t* parent = NULL;

    assert(curr);

    if (GetLeftChild(curr))
    {
        curr = GetLeftChild(curr);
        GoRightAsMuchAsYouCan(&curr);
    }
    else
    {
        parent = GetParent(curr);
        while (NULL != parent && curr == GetLeftChild(parent))
        {
            curr = parent;
            parent = GetParent(parent);
        }
        curr = parent;
    }

    return NodeToIter(curr);
}

#pragma region Helpers
static node_t* IterToNode(bst_iter_t iter)
{
    return (node_t*) iter;
}

static bst_iter_t NodeToIter(node_t* node)
{
    return (bst_iter_t) node;
}

static node_t* GetParent(const node_t* node)
{
    return node->parent;
}

static void SetParent(node_t* node, node_t* new_parent)
{
    if (NULL == node)
    {
        return;
    }

    node->parent = new_parent;
}

static node_t* GetLeftChild(const node_t* node)
{
    return node->children[LEFT];
}

static node_t* GetRightChild(const node_t* node)
{
    return node->children[RIGHT];
}

static node_t* GetChild(const node_t* node, int child)
{
    return node->children[child];
}

static void SetLeftChild(node_t* node, node_t* new_child)
{
    node->children[LEFT] = new_child;
}

static void SetRightChild(node_t* node, node_t* new_child)
{
    node->children[RIGHT] = new_child;
}

static void SetChild(node_t* node, int child, node_t* new_child)
{
    node->children[child] = new_child;
}

static void SetData(node_t* node, void* new_data)
{
    node->data = new_data;
}

static void* GetData(const node_t* node)
{
    return node->data;
}

static int CompareNodes(const bst_t* tree, const void* data1, const void* data2)
{
    return tree->cmp_func(data1, data2);
}

static int IsDummyNode(const node_t* node)
{
    return GetParent(node) == node;
}

static void GetMinNode(node_t** node)
{
    while (GetLeftChild(*node))
    {
        *node = GetLeftChild(*node);
    }
}

static void GoRightAsMuchAsYouCan(node_t** node)
{
    while (GetRightChild(*node))
    {
        *node = GetRightChild(*node);
    }
}

static int IsLeaf(const node_t* node)
{
    return (!GetLeftChild(node) && !GetRightChild(node));
}

static int IsRightChild(const node_t* node)
{
    return GetRightChild(GetParent(node)) == node;
}

static int IsLeftChild(const node_t* node)
{
    return GetLeftChild(GetParent(node)) == node;
}

static size_t GetHeight(const node_t* node)
{
    if (NULL == node)
    {
        return 0;
    }

    if (IsLeaf(node))
    {
        return 1;
    }

    return MAX(GetHeight(GetLeftChild(node)), GetHeight(GetRightChild(node))) +
           1;
}

static node_t* CreateNode(node_t* left_child, node_t* right_child,
                          node_t* parent, void* data)
{
    node_t* node = NULL;

    node = (node_t*) malloc(sizeof(node_t));
    if (NULL == node)
    {
        return NULL;
    }

    SetLeftChild(node, left_child);
    SetRightChild(node, right_child);
    SetParent(node, parent);
    SetData(node, data);

    return node;
}

static void TransplantNode(node_t* parent, const node_t* node,
                           node_t* replacement)
{
    SetChild(parent, IsLeftChild(node) ? LEFT : RIGHT, replacement);

    SetParent(replacement, parent);
    SetLeftChild(replacement, GetLeftChild(node));
    SetRightChild(replacement, GetRightChild(node));
}

static void UnlinkNode(node_t* replacement, replace_dir_t source)
{
    assert(NULL != replacement);

    if (FROM_PREDECESSOR == source)
    {
        SetChild(GetParent(replacement),
                 IsLeftChild(replacement) ? LEFT : RIGHT,
                 GetLeftChild(replacement));

        if (NULL != GetLeftChild(replacement))
        {
            SetParent(GetLeftChild(replacement), GetParent(replacement));
        }
    }
    else
    {
        SetChild(GetParent(replacement),
                 IsRightChild(replacement) ? RIGHT : LEFT,
                 GetRightChild(replacement));

        if (NULL != GetRightChild(replacement))
        {
            SetParent(GetRightChild(replacement), GetParent(replacement));
        }
    }
}

#pragma endregion
