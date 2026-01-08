#ifndef ILRD_INVERTBST_H
#define ILRD_INVERTBST_H

#include <stddef.h>
/*
Implement a function that inverts a balanced Binary Search Tree (BST) in-place, preserving the tree's structure but in a mirrored image.

Following conversion, the new tree's structure must resemble a mirror of the original structure.

The function should be implemented using recursion.


Constraints:
Usage of auxiliary data structure is not allowed.
Allocation of additional memory is not allowed.
Please note, the function InvertBst is the interface function only.
Implement the recursion logic in the function InvertBstHelper, which will be called from InvertBst.
*/

typedef struct BstNode
{
    struct BstNode* left;
    struct BstNode* right;
    int data;
} bst_node_ty;

void InvertBst(bst_node_ty* root);

#endif /* ILRD_INVERTBST_H */
