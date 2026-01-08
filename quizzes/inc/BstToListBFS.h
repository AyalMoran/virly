#ifndef ILRD_BSTTOLISTBFS_H
#define ILRD_BSTTOLISTBFS_H

#include <stddef.h>

/*
Implement a function that converts a binary search tree (BST) into an integer array, level by level.

The data from the BST should be copied into the array using Breadth First Search, with the following order: root data first, followed by the next level from left to right, and so on.

Constraints:
Consider using a data structure in your implementation.
*/

typedef struct BstNode
{
    struct BstNode* left;
    struct BstNode* right;
    int data;
} bst_node_ty;

void BstToListBFS(const bst_node_ty* root, int array[], size_t size);

#endif /* ILRD_BSTTOLISTBFS_H */
