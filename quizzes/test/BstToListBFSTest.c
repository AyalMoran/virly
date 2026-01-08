/**************************************************************
 * File    : BstToListBFSTest.c
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "BstToListBFS.h"
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

static void PrintArray(int arr[], size_t size)
{
    size_t i = 0;
    printf("[ ");
    for (i = 0; i < size; ++i)
    {
        printf("%d", arr[i]);
        if (i < size - 1)
        {
            printf(", ");
        }
    }
    printf(" ]\n");
}

int main(void)
{
    bst_node_ty* root = NULL;
    int array[7] = {0};
    size_t size = 7;
    size_t i = 0;
    
    /* Create a sample BST:
     *       4
     *      / \
     *     2   6
     *    / \ / \
     *   1  3 5  7
     * 
     * BFS order: 4, 2, 6, 1, 3, 5, 7
     */
    root = CreateNode(4);
    root->left = CreateNode(2);
    root->right = CreateNode(6);
    root->left->left = CreateNode(1);
    root->left->right = CreateNode(3);
    root->right->left = CreateNode(5);
    root->right->right = CreateNode(7);
    
    printf("BST structure:\n");
    printf("       4\n");
    printf("      / \\\n");
    printf("     2   6\n");
    printf("    / \\ / \\\n");
    printf("   1  3 5  7\n\n");
    
    BstToListBFS(root, array, size);
    
    printf("BFS traversal result: ");
    PrintArray(array, size);
    printf("Expected: [ 4, 2, 6, 1, 3, 5, 7 ]\n");
    
    int expected[] = {4, 2, 6, 1, 3, 5, 7};
    int match = 1;
    for (i = 0; i < size; ++i)
    {
        if (array[i] != expected[i])
        {
            match = 0;
            break;
        }
    }
    
    printf("Result: %s\n", match ? "PASS" : "FAIL");
    
    DestroyTree(root);
    
    return 0;
}
