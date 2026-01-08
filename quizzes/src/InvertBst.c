/**************************************************************
 * File    : InvertBst.c
 * Author  : Ayal Moran
 * Reviewer: 
 * Date    : 
**************************************************************/

/*============================ INCLUDES ============================*/
#include <stddef.h>
#include <assert.h>

#include "InvertBst.h"

/*========================== DEFINITIONS ===========================*/

static struct BstNode* InvertBstHelper(struct BstNode* root);

void InvertBst(bst_node_ty* root)
{ 
    assert(root);
	InvertBstHelper(root);
}

static struct BstNode* InvertBstHelper(struct BstNode* root)
{
    struct BstNode* tmp = NULL;
    
    if(NULL == root)
    {
        return root;
    }
    
    tmp = root->right;
    root->right = root->left;
    root->left = tmp;
    
	InvertBstHelper(root->right);
    InvertBstHelper(root->left);
    
    return root;
}
