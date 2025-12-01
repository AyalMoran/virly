/**************************************************************
 * File    : avl.c
 * Author  : Ayal Moran
 * Reviewer: 
 * Date    : 
**************************************************************/
#ifndef __AVL_H__
#define __AVL_H__

#include <stddef.h> /* size_t */
#include <sys/types.h> /* ssize_t */
/**/
typedef int (*avl_cmp_t)(const void* data1, const void* data2);
typedef int (*avl_callback_t) (void* data, void* param);


typedef enum traversal
{
    PRE_ORDER,
    IN_ORDER, 
    POST_ORDER
}traversal_t;

typedef enum status
{
    AVL_SUCCESS,
    AVL_FAILURE
}avl_status_t;

typedef struct AVL avl_t;

/**
 * Name: AVLCreate
 * 
 * Description:
 *   Creates a Binary Tree (AVL)
 *
 * Parameters: 
 *   @param cmp - pointer to a valid compare function
 *
 *  Space Complexity: O(1)
 *  Time Complexity: O(1)
 *
 * Returns:
 *  avl_t* - pointer to a tree on success, NULL on fail 
 */
avl_t* AVLCreate(avl_cmp_t cmp);

/**
 * Function Name: AVLDestroy    
 * 
 * Description:
 *   Frees the tree's memory.
 * 
 * Parameters: 
 *   @param tree - pointer to a valid AVL
 * 
 *  Space Complexity: O(log n) 
 *  Time Complexity: O(n) 
 * 
 */
void AVLDestroy(avl_t* tree);

/**
 * Function Name: AVLInsert
 * 
 * Description:
 *   Insert new element in the AVL keeps the tree balanced.
 * 
 * Parameters:
 *   @param tree - pointer to a valid AVL
 *   @param data - data to insert
 * 
 *  Space Complexity: O(log n)
 *  Time Complexity: WC: O(n) AC: O(log n) 
 * 
 * Returns:
 *      int - return 1 on success 0 otherwise (on failure).
 */
int AVLInsert(avl_t* tree, const void* data); 

/**
 * Function Name: AVLRemove
 * 
 * Description:
 *   Remove element in the AVL and keeps the tree balanced.
 * 
 * Parameters:
 *   @param tree - pointer to a valid AVL
 *   @param data - data to remove
 * 
 *  Space Complexity: O(log n)
 *  Time Complexity: O(log n) 
 * 
 * Returns:
 *      pointer to returned data.
*/
void* AVLRemove(avl_t* tree, void* data);


/**
 * Function Name: AVLIsEmpty
 * 
 * Description:
 *   check if the tree empty.
 * 
 * Parameters:
 *   @param tree - pointer to a valid AVL
 *
 * 
 *  Space Complexity: O(1)
 *  Time Complexity: O(1) 
 * 
 * Returns:
 *      int - return 1 on Empty 0 otherwise.
*/
int AVLIsEmpty(const avl_t* tree);

/**
 * Function Name: AVLSize
 * 
 * Description:
 *   check the tree size.
 * 
 * Parameters:
 *   @param tree - pointer to a valid AVL
 *
 * 
 *  Space Complexity: O(n)
 *  Time Complexity: O(log n) 
 * 
 * Returns:
 *      size_t - the tree size.
*/
size_t AVLSize(const avl_t* tree);

/**
 * Name: AVLHeight
 * 
 * Description: Height of the tree 
 *   
 *
 * Parameters: 
 *   @param tree - pointer to a valid AVL
 *
 *  Space Complexity: O(1)
 *  Time Complexity: O(1)
 *
 * Returns:
 *  ssize_t representing height of tree (-1 if there's no root)
 */
ssize_t AVLHeight(const avl_t* tree);

/**
 * Name: AVLFind
 * 
 * Description:
 *   The function finds and returns the data in the AVL
 *
 * Parameters: 
 *   @param tree - pointer to a valid AVL
 *   @param data - The comparison data that is used in the match function
 * 
 *  Space Complexity: O(logn)
 *  Time Complexity: O(logn)
 *
 * Returns:
 *  void* - the data structure, NULL if not found
 */
void* AVLFind(const avl_t* tree, const void* data);

/**
 * Name: AVLForEach
 * 
 * Description:
 *   The function traverses the tree according to the order provided (pre\in\post)
 *   on each node along the way the callback function will be invoked
 * 
 *   @param tree - pointer to a valid AVL
 *   @param order - traversal order (INORDER, PREORDER, or POSTORDER)
 *   @param callback - the operation function which the user specified
 *   @param param - pointer to the param of the op function
 *
 *  Space Complexity: O(logn)
 *  Time Complexity: O(n)
 *
 * Returns:
 *   int - returns 0 on success, 1 otherwise
 */				   
int AVLForEach(avl_t* tree, avl_callback_t callback, traversal_t order, void* param);

int BSTInsertRec(avl_t* tree, const void* data);

void* BSTRemoveRec(avl_t* tree, void* data);


#endif /* __AVL_H__ */
