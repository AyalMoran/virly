
#ifndef __ILRD_BST_H__
#define __ILRD_BST_H__

#include <stddef.h>         /* size_t */

typedef struct bst bst_t;
typedef struct node node_t;

typedef node_t* bst_iter_t;

  /**
 * @brief Creates and initialize a Binary Search Tree™.
 *
 * @param cmp_func A comparison function that takes two data elements and returns: 
 *            - A negative value if data1 < data2
 *            - Zero if data1 == data2
 *            - A positive value if data1 > data2.
 *
 * @return A pointer to the created Binary Search Tree™.
 *
 * @note  complexity Time: O(1)		Space: O(1)
 */
bst_t* BSTCreate(int (*cmp_func) (const void* val1, const void* val2));
  /**
 * @brief Remove all nodes from the Binary Search Tree™ and frees the allocated
 * .
 *
 * @param tree 	The tree to free from memory.
 *
 * @return void.
 *
 * @note  complexity Time: O(n)		Space: O(1)
 */
void BSTDestroy(bst_t* tree); /* post/in order */

  /**
 * @brief Inserts the data into the Binary Search Tree™.
 *
 * @param tree 	The Binary Search Tree™ to insert *data* into.
 * @param data  A pointer to the data to store.
 *
 * @return An iterator to the new node in *tree* that stores *data*.
 *
 * @note  complexity Time: Average: O(logN), Worst: O(n) if data is inserted
 *                                  monotonically.
 *                                  Space: O(1)
 */
bst_iter_t BSTInsert(bst_t* tree, void* data);

  /**
 * @brief Removing a node from the Binary Search Tree™.
 *
 * @param to_remove 	An iterator to the node to remove.
 *
 * @return Return value description.
 *
 * @note  complexity Time: Average: O(logN), Worst: O(n) if data is inserted
 *                         monotonically.
 *                         Space : O(1)
 */
void BSTRemove(bst_iter_t to_remove);

/**
 * @brief Finds a given value in teh Binary Search Tree™.
 *
 * @param tree 	The Binary Search Tree to traverse.
 * @param data 	The data to find.
 *
 * @return      An iterator to the node found.
 *              Returns BSTEnd() on failure to find a node
 *              with the given data.
 *
 * @note  Complexity - Time: O(logN)	Space: O(1)
 */
bst_iter_t BSTFind(const bst_t* tree, void* data);
  /**
 * @brief calls an action function for each node in a given range
 * [from, to) of the Binary Search Tree™.
 *
 * @param from 	        An iterator to the start of the range.
 * @param to 	        An iterator to the end of the range
 *                      (non-inclusive).
 * @param action_func 	A function(const void* data, void* param) to
 *                      perform on each node in the input range.
 *                      Must return 0 as a success status.
 * @param param 	    A parameter that will be given to *action_func*
 *                      as an input.
 *
 * @return  The return status of action_func.
 *          If action_func fails on a certain node,
 *          the function will halt and return the failure status.
 *
 * @note  Complexity -  Time: O(n * a) where a is the complexity of the
 * action_func.		Space      : O(1)
 */
int BSTForEach(bst_iter_t from, bst_iter_t to, 
    int (*action_func)(void* data, void* param), void* param); /* in order */

  /**
 * @brief Returns whether the Binary Search Tree™ is empty or not.
 *
 * @param tree 	The tree to assess.
 *
 * @return A boolean integer (1 = the Tree is Empty, 0 otherwise).
 *
 * @note  complexity Time: O(1)		Space: O(1)
 */
int BSTIsEmpty(const bst_t* tree);

  /**
 * @brief Calculates the number of nodes in a BST.
 *
 * @param[in]  tree   The Binary Search Tree™ to assess.
 *
 * @return     The number of nodes in the *tree*.
 *
 * @note       complexity Time: O(n)  Space: O(1)
 */
size_t BSTSize(const bst_t* tree);

  /**
 * @brief Retrieves the stored data from a given iterator.
 *
 * @param iter 	An iterator to the requested node holding the data.
 *
 * @return A pointer to the stored data.
 *
 * @note  complexity Time: O(1)		Space: O(1)
 */
void* BSTGetData(bst_iter_t iter);

  /**
 * @brief Compares two iterators by node.
 *
 * @param iter1 	A Binary Search Tree iterator.
 * @param iter2 	A Binary Search Tree iterator.
 *
 * @return A boolean int, returnes 1 if iterators point to the same node,
 *         0 otherwise.
 *
 * @note  complexity Time: O(1)		Space: O(1)
 */
int BSTIterIsEqual(bst_iter_t iter1, bst_iter_t iter2);

  /**
 * @brief Retrieves an Iterator to the node that stores the minimal value of
 *        the Binary Search Tree.
 *
 * @param tree 	  A pointer to the Binary Search Tree to assess.
 *
 * @return An Iterator to the minimum node in *tree*.
 *
 * @note  complexity Time: Average: O(logN), Worst: O(n) if data is inserted
 *                         monotonically.
 *                         Space : O(1)
 */
bst_iter_t BSTBegin(const bst_t* tree);

  /**
 * @brief Returns the point past the last value of the Binary Search Tree.
 *
 * @param tree 	  A pointer to the Binary Search Tree to assess.
 *
 * @return Return value description.
 *
 * @note  complexity Time: O(n)		Space: O(1)
 */
bst_iter_t BSTEnd(const bst_t* tree);

    /**
   * @brief Brief description.
   *
   * @param param1 	Description of param1.
   * @param param2 	Description of param2.
   * @param param3 	Description of param3.
   * @param param4 	Description of param4.
   * @param param5 	Description of param5.
   *
   * @return Return value description.
   *
   * @note  complexity Time: O(n)		Space: O(1)
   */
bst_iter_t BSTNext(bst_iter_t iter);  /* in order */

  /**
 * @brief Brief description.
 *
 * @param param1 	Description of param1.
 * @param param2 	Description of param2.
 * @param param3 	Description of param3.
 * @param param4 	Description of param4.
 * @param param5 	Description of param5.
 *
 * @return Return value description.
 *
 * @note  complexity Time: O(n)		Space: O(1)
 */
bst_iter_t BSTPrev(bst_iter_t iter);

#endif /* __ILRD_BST_H__ */
