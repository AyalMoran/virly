/******************
 Author : Ayal Moran
 Reviewer: Susie Altalef-Cohen
 Date: 08.04.25
******************/

#ifndef _ILRD_DLL_H_
#define _ILRD_DLL_H_

#include <stddef.h> /* size_t */

typedef struct dllist dllist_t;
typedef struct node* dll_iter_t;
/**
 * @brief Creates a new doubly linked list.
 *
 * Allocates a new list and initializes it with dummy head and tail nodes.
 *
 * @return A pointer to the new list, or NULL if malloc fails.
 * @space complexity: O(1)
 * @time complexity: O(1)
 */
dllist_t* DLLCreate(void);

/**
 * @brief Destroys a doubly linked list.
 *
 * Frees all nodes in the list and then the list itself.
 *
 * @param list A pointer to the list. Must not be NULL.
 *             Undefined behavior if NULL is passed.
 * @space complexity: O(1)
 * @time complexity: O(n)
 */
void DLLDestroy(dllist_t* list);

/**
 * @brief Returns the first real element.
 *
 * @param list A pointer to the list. Must not be NULL.
 *             Undefined behavior if NULL is passed.
 * @return Iterator to the first element.
 * @space complexity: O(1)
 * @time complexity: O(1)
 */
dll_iter_t DLLBegin(const dllist_t* list);

/**
 * @brief Returns the end iterator (dummy tail).
 *
 * @param list A pointer to the list. Must not be NULL.
 *             Undefined behavior if NULL is passed.
 * @return Iterator to the tail dummy node.
 * @space complexity: O(1)
 * @time complexity: O(1)
 */
dll_iter_t DLLEnd(const dllist_t* list);

/**
 * @brief Moves the iterator to the next node.
 *
 * @param curr The current iterator. Must not be NULL and must have a valid next node.
 *             Undefined behavior if curr is NULL or if curr is the dummy tail.
 * 
 * @return Iterator to the next node.
 * @space complexity: O(1)
 * @time complexity: O(1)
 */
dll_iter_t DLLNext(const dll_iter_t curr);

/**
 * @brief Moves the iterator to the previous node.
 *
 * @param curr The current iterator. Must not be NULL and must have a valid previous node.
 *             Undefined behavior if curr is NULL or if curr is the first element of the 
 * 		       list.
 * @return Iterator to the previous node.
 * @space complexity: O(1)
 * @time complexity: O(1)
 */
dll_iter_t DLLPrev(dll_iter_t curr);

/**
 * @brief Checks if two iterators are equal.
 *
 * @param iter1 First iterator. Must not be NULL.
 * @param iter2 Second iterator. Must not be NULL.
 * @return 1 if they are the same, else 0.
 * @space complexity: O(1)
 * @time complexity: O(1)
 */
int DLLIterIsEqual(dll_iter_t iter1, dll_iter_t iter2);

/**
 * @brief Gets the data from a node.
 *
 * @param iter The iterator. Must not be NULL.
 * @return A pointer to the data.
 * @space complexity: O(1)
 * @time complexity: O(1)
 */
void* DLLGetData(dll_iter_t iter);

/**
 * @brief Sets the data of a node.
 *
 * @param iter The iterator. Must not be NULL.
 * @param data Pointer to the new data.
 * @space complexity: O(1)
 * @time complexity: O(1)
 */
void DLLSetData(dll_iter_t iter, void* data);

/**
 * @brief Inserts a new node before the given iterator.
 *
 * @param where Iterator where the new node will be inserted.
 *              Must not be NULL and must be a valid iterator.
 * @param data Pointer to the data for the new node.
 * @return Iterator to the new node. If malloc fails, returns an iterator to the end.
 * @space complexity: O(1)
 * @time complexity: O(1)
 */
dll_iter_t DLLInsert(dll_iter_t where, const void* data);

/**
 * @brief Removes the node at the iterator.
 *
 * Frees the node and returns an iterator to the next node.
 *
 * @param iter The iterator for the node to remove.
 *             Must not be NULL and must not be the tail dummy node (i.e. iter->next must be valid).
 * @return Iterator to the next node.
 * @space complexity: O(1)
 * @time complexity: O(1)
 */
dll_iter_t DLLRemove(dll_iter_t iter);

/**
 * @brief Inserts a new node at the beginning of the list.
 *
 * @param list A pointer to the list. Must not be NULL.
 * @param data Pointer to the data.
 * @return Iterator to the new node. return DLLEnd(list) if insertion fails.
 * @space complexity: O(1)
 * @time complexity: O(1)
 */
dll_iter_t DLLPushFront(dllist_t* list, const void* data);

/**
 * @brief Inserts a new node at the end of the list.
 *
 * @param list A pointer to the list. Must not be NULL.
 * @param data Pointer to the data.
 * @return Iterator to the new node.
 * @space complexity: O(1)
 * @time complexity: O(1)
 */
dll_iter_t DLLPushBack(dllist_t* list, const void* data);

/**
 * @brief Removes and returns the data from the front.
 *
 * @param list A pointer to the list. Must not be NULL and the list must not be empty.
 * @return Pointer to the data of the removed node.
 * @space complexity: O(1)
 * @time complexity: O(1)
 */
void* DLLPopFront(dllist_t* list);

/**
 * @brief Removes and returns the data from the back.
 *
 * @param list A pointer to the list. Must not be NULL and the list must not be empty.
 * @return Pointer to the data of the removed node.
 * @space complexity: O(1)
 * @time complexity: O(1)
 */
void* DLLPopBack(dllist_t* list);

/**
 * @brief Checks if the list is empty.
 *
 * @param list A pointer to the list. Must not be NULL.
 * @return 1 if empty, else 0.
 * @space complexity: O(1)
 * @time complexity: O(1)
 */
int DLLIsEmpty(const dllist_t* list);

/**
 * @brief Counts the nodes in the list.
 *
 * @param list A pointer to the list. Must not be NULL.
 * @return The number of nodes.
 * @space complexity: O(1)
 * @time complexity: O(n)
 */
size_t DLLCount(const dllist_t* list);

/**
 * @brief Applies a function to each node in a range.
 *
 * Runs the given action on each node's data from 'from' to (not including) 'to'.
 *
 * @param from Iterator to start. Must not be NULL and must be a valid iterator.
 * @param to Iterator end (not included). Must not be NULL and must be a valid iterator.
 * @param action The function to run on each data item. Must not be NULL.
 * @param param Extra param passed to the action.
 * @return Non-zero if the action told it to stop, else 0.
 * @space complexity: O(1)
 * @time complexity: O(n)
 */
int DLLForEach(dll_iter_t from, dll_iter_t to, int (*action)(void* data, void* param), void* param);

/**
 * @brief Finds the first node that meets a condition.
 *
 * Searches for a node where the is_match function   returns 1.
 *
 * @param from Iterator to start. Must not be NULL and must be a valid iterator.
 * @param to Iterator end. Must not be NULL and must be a valid iterator.
 * @param is_match Function that checks if a node matches. Must not be NULL.
 * @param param Extra param for the check function.
 * @return Iterator to the matching node, or the 'to' iterator if no match is found.
 * @space complexity: O(1)
 * @time complexity: O(n)
 */
dll_iter_t DLLFind(dll_iter_t from, dll_iter_t to, int (*is_match)(const void* data, void* param), void* param);

/**
 * @brief Finds all nodes that match a condition and adds them to a destination list.
 *
 * For each node in the range that matches, it pushes the data to the destination list.
 *
 * @param from Iterator to start. Must not be NULL and must be valid.
 * @param to Iterator end. Must not be NULL and must be valid.
 * @param is_match Function to check a node. Must not be NULL.
 * @param param Extra param for the check.
 * @param dest Destination list for the matching nodes. Must not be NULL and must be a valid list.
 * @return 0 if at least one match was found, or 1 if an error (like malloc failure) occurs.
 * @space complexity: O(1)
 * @time complexity: O(n)
 */
int DLLMultiFind(dll_iter_t from, dll_iter_t to, int (*is_match)(const void* data, void* param), void* param, dllist_t* dest);

/**
 * @brief Splices a range of nodes into another list.
 *
 * Moves nodes in the range [from, to) and inserts them before the 'where' iterator.
 *
 * @param where Iterator in the destination list where nodes are to be inserted.
 *              Must not be NULL and must be a valid iterator.
 * @param from Iterator to start splicing. Must not be NULL and must be valid.
 * @param to Iterator to end splicing. Must not be NULL and must be valid.
 * @space complexity: O(1)
 * @time complexity: O(1)
 */
void DLLSplice(dll_iter_t where, dll_iter_t from, dll_iter_t to);

#endif /* _ILRD_DLL_H_ */

