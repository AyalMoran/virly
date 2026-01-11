/**************************************************************
 * File    : InvertBstTest.c
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "InvertBst.h"
#include "test_utils.h"

/******************************************************
 * START OF ACTUAL TESTS
 ******************************************************/

static bst_node_ty* CreateNode(int data)
{
    bst_node_ty* node = (bst_node_ty*)malloc(sizeof(bst_node_ty));
    if (NULL == node)
    {
        return NULL;
    }
    
    node->data = data;
    node->left = NULL;
    node->right = NULL;
    
    return node;
}

static void PrintInOrder(bst_node_ty* root)
{
    if (NULL == root)
    {
        return;
    }
    
    PrintInOrder(root->left);
    printf("%d ", root->data);
    PrintInOrder(root->right);
}

static void DestroyTree(bst_node_ty* root)
{
    if (NULL == root)
    {
        return;
    }
    
    DestroyTree(root->left);
    DestroyTree(root->right);
    free(root);
}

int main(void)
{
    bst_node_ty* root = NULL;
    
    /* Create a sample BST:
     *       4
     *      / \
     *     2   7
     *    / \ / \
     *   1  3 6  9
     */
    root = CreateNode(4);
    root->left = CreateNode(2);
    root->right = CreateNode(7);
    root->left->left = CreateNode(1);
    root->left->right = CreateNode(3);
    root->right->left = CreateNode(6);
    root->right->right = CreateNode(9);
    
    printf("Original BST (in-order): ");
    PrintInOrder(root);
    printf("\n");
    
    InvertBst(root);
    
    printf("Inverted BST (in-order): ");
    PrintInOrder(root);
    printf("\n");
    
    /* Expected after inversion:
     *       4
     *      / \
     *     7   2
     *    / \ / \
     *   9  6 3  1
     * In-order: 9 7 6 4 3 2 1
     */
    
    DestroyTree(root);
    
    return 0;
}
