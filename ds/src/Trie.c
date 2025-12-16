/*
*************************************************************
 *  File        : Trie.c
 *  Author      : Ayal Moran
 *  Reviewer    : Chen Mugany
 *  Date        : 11-12-2025
 **************************************************************/
#include <assert.h>/* assert  */
#include <stdlib.h> /* malloc */

#include "Trie.h" /* trie_t */

typedef enum
{
    ZERO = 0,
    ONE,
    NUM_OF_CHILDREN
} child_t;

typedef struct node
{
    int is_full;
    struct node* children[NUM_OF_CHILDREN];
} node_t;

struct Trie
{
    size_t word_len;
    node_t* stub_root;
};

/*
 * ****************************************************************************/
#define TRUE (1)
#define FALSE (0)

#define FULL (1)
#define EMPTY (0)

#define SUCCESS (0)
#define FAILURE (1)

#define LEFT (0)
#define RIGHT (1)

#define LEFT_CHILD_OF(node) ((node)->children[LEFT])
#define RIGHT_CHILD_OF(node) ((node)->children[RIGHT])

#define IPv4_BITS (32)

#define IS_NODE_NOT_FULL(node) (!(node) || !(node)->is_full)

#define IS_NODE_EMPTY(node) (!(node)->children[ZERO] && !(node)->children[ONE])

#define SET_BIT(val, k, bit) (((val) & ~(0x1 << (k))) | ((bit) << (k)))

/*
*****************************************************************************
*                    ──  static decs ──                  *
*****************************************************************************/
static void DestroySubTree(node_t* subroot);

static int CreateNode(node_t* node, child_t child_type);

static trie_status_t InsertNode(node_t* node, int32_t to_insert, size_t depth,
                                int32_t* inserted);

static trie_status_t InsertToLeaf(node_t* node, child_t child_type,
                                  int32_t* inserted);

static int IsSubtreeFull(const node_t* subroot);

static int RemoveNode(node_t* node, int32_t to_remove, size_t depth);

static size_t CountLeaves(const node_t* node, size_t depth);

static int32_t FindMinFree(const node_t* node, size_t depth, int32_t current_value);

/*
*****************************************************************************
*                              ──  API  ──                                  *
******************************************************************************/
trie_t* TrieCreate(size_t word_len)
{
    trie_t* tree = NULL;

    assert(word_len < IPv4_BITS);

    tree = (trie_t*) malloc(sizeof(trie_t));
    if (NULL == tree)
    {
        return NULL;
    }

    tree->stub_root = (node_t*) calloc(1, sizeof(node_t));
    if (NULL == tree->stub_root)
    {
        free(tree);
        return NULL;
    }

    tree->word_len = word_len;

    return tree;
}


void TrieDestroy(trie_t* tree)
{
    assert(NULL != tree);

    DestroySubTree(tree->stub_root);

    free(tree);
}

trie_status_t TrieInsert(trie_t* tree, int32_t to_insert, int32_t* inserted)
{
    trie_status_t res = SUCCESS;
    int32_t min_free = 0;

    assert(NULL != tree);
    assert(NULL != inserted);

    res = InsertNode(tree->stub_root, to_insert, tree->word_len - 1, inserted);

    if (TRIE_ERR_FULL == res)
    {
        min_free = FindMinFree(tree->stub_root, tree->word_len - 1, 0);
        *inserted = 0;
        res = InsertNode(tree->stub_root, min_free, tree->word_len - 1, inserted);
    }

    return res;
}

int TrieRemove(trie_t* tree, int32_t to_remove)
{
    assert(tree);

    return RemoveNode(tree->stub_root, to_remove, tree->word_len - 1);
}

size_t TrieCount(const trie_t* tree)
{
    assert(tree);

    return CountLeaves(tree->stub_root, tree->word_len - 1);
}
/*
*****************************************************************************
*                              ──  static defs  ──                           *
******************************************************************************/

static trie_status_t InsertNode(node_t* node, int32_t to_insert, size_t depth,
                                int32_t* inserted)
{
    child_t direction = (to_insert >> depth) & 0x1;
    trie_status_t res = SUCCESS;

    assert(node);

    *inserted = SET_BIT(*inserted, depth, direction);

    if (TRUE == node->is_full)
    {
        return TRIE_ERR_FULL;
    }

    if (0 == depth)
    {
        return InsertToLeaf(node, direction, inserted);
    }

    if ((NULL == node->children[direction]) &&
        (FAILURE == CreateNode(node, direction)))
    {
        return TRIE_ERR_ALLOC;
    }

    res = InsertNode(node->children[direction], to_insert, depth - 1, inserted);

    node->is_full = IsSubtreeFull(node);

    return res;
}

static trie_status_t InsertToLeaf(node_t* node, child_t child_type,
                                  int32_t* inserted)
{
    assert(node);

    if ((RIGHT == child_type) && (NULL != RIGHT_CHILD_OF(node)))
    {
        return TRIE_ERR_FULL;
    }
    else if (NULL != node->children[child_type])
    {
        return TRIE_ERR_FULL;
    }

    node->children[child_type] = node;
    
    node->is_full = (NULL != node->children[!child_type]) ? FULL : EMPTY;
    
    return SUCCESS;
}

static int CreateNode(node_t* parent, child_t child_type)
{
    assert(parent);

    parent->children[child_type] = (node_t*) calloc(1, sizeof(node_t));

    return (NULL == parent->children[child_type]) ? FAILURE : SUCCESS;
}

static int RemoveNode(node_t* node, int32_t to_remove, size_t depth)
{
    child_t direction = (to_remove >> depth) & 0x1;
    int res = SUCCESS;

    assert(node);

    if (NULL == node->children[direction])
    {
        return FAILURE;
    }

    if (0 == depth)
    {
        node->children[direction] = NULL; 
        node->is_full = FALSE;
    }
    else
    {
        res = RemoveNode(node->children[direction], to_remove, depth - 1);

        if (IS_NODE_EMPTY(node->children[direction]))
        {
            free(node->children[direction]);
            node->children[direction] = NULL;
        }
    }

    return res;
}

static size_t CountLeaves(const node_t* node, size_t depth)
{
    if (NULL == node)
    {
        return 0;
    }

    if (0 == depth) 
    {
        return (node == node->children[ZERO]) + (node == node->children[ONE]);
    }

    return CountLeaves(node->children[ZERO], depth - 1) +
           CountLeaves(node->children[ONE], depth - 1);
}

static int IsSubtreeFull(const node_t* subroot)
{
    if (subroot->children[ZERO] && subroot->children[ONE])
    {
        return subroot->children[ZERO]->is_full &&
               subroot->children[ONE]->is_full;
    }
    return FALSE;
}

static void ClearChildren(node_t *node)
{
    if (node->children[ZERO] == node)
    {
        node->children[ZERO] = NULL;
    }
    if (node->children[ONE] == node)
    {
        node->children[ONE] = NULL;
    }
}

static void DestroySubTree(node_t* subroot)
{
    if (NULL == subroot)
    {
        return;
    }

    if (IS_NODE_EMPTY(subroot))
    {
        free(subroot);
        return;
    }

    ClearChildren(subroot);

    DestroySubTree(RIGHT_CHILD_OF(subroot));
    DestroySubTree(LEFT_CHILD_OF(subroot));
    free(subroot);
}

static int32_t FindMinFree(const node_t* node, size_t depth, int32_t current_value)
{
    if (NULL == node)
    {
        return current_value;
    }

    if (0 == depth)
    {
        if (NULL == node->children[ZERO])
        {
            return current_value;
        }
        if (NULL == node->children[ONE])
        {
            return current_value + 1;
        }
        return current_value + 2;
    }

    if (NULL == node->children[ZERO])
    {
        return current_value;
    }

    if (FALSE == node->children[ZERO]->is_full)
    {
        return FindMinFree(node->children[ZERO], depth - 1, current_value);
    }

    if (NULL == node->children[ONE])
    {
        return current_value + (1 << depth);
    }

    if (FALSE == node->children[ONE]->is_full)
    {
        return FindMinFree(node->children[ONE], depth - 1, current_value + (1 << depth));
    }

    return current_value + (2 << depth);
}