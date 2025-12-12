/******************
 Author : Ayal Moran
 Reviewer: Or Caraco
 Date: 01.04.25
 *****************/
#ifndef _ILRD_SLL_H_
#define _ILRD_SLL_H_

#include <stddef.h> /*size_t*/

typedef int (*action_func_t)(void* data, void* param);
typedef int (*is_match_t)(const void* data, void* param);

typedef struct linked_list sll_t;
typedef struct node* sll_iter_t;
/**
 * @brief Create a new singly linked list.
 * @discription This function creates a new list with a dummy node.
 * @return A pointer to the new list or NULL if memory allocation failed.
 * @time complexity: O(1)
 * @space complexity: O(1)
 */
sll_t* SLLCreate(void);

/**
 * @brief Destroy a singly linked list.
 * @discription This function frees all the nodes in the list and then the list itself.
 * @param list The list to be destroyed.
 * @return None.
 * @time complexity: O(n)
 * @space complexity: O(1)
 */
void SLLDestroy(sll_t* list);

/**
 * @brief Check if the list is empty.
 * @discription This function checks if the list only has the dummy node.
 * @param list The list to check.
 * @return Non-zero if the list is empty, zero otherwise.
 * @time complexity: O(1)
 * @space complexity: O(1)
 */
int SLLIsEmpty(const sll_t* list);

/**
 * @brief Execute an action for each element in a range.
 * @discription This function applies the given action to each element in the range.
 * @param from The iterator where to start.
 * @param to The iterator where to stop.
 * @param action The function to be executed on each element.
 * @param param A parameter to pass to the action function.
 * @return The return value of the action if non-zero, otherwise zero.
 * @time complexity: O(n)
 * @space complexity: O(1)
 */
int SLLForEach(sll_iter_t from, sll_iter_t to, action_func_t action, void* param);

/**
 * @brief Count the number of elements in the list.
 * @discription This function counts all the nodes in the list except the dummy.
 * @param list The list to count.
 * @return The number of elements in the list.
 * @time complexity: O(n)
 * @space complexity: O(1)
 */
size_t SLLCount(const sll_t* list);

/**
 * @brief Insert an element in the list.
 * @discription This function inserts a new element before the given iterator.
 * @param where The iterator indicating the insert location.
 * @param data The data to be inserted.
 * @return The iterator where the new element was inserted.
 * @time complexity: O(1)
 * @space complexity: O(1)
 */
sll_iter_t SLLInsert(sll_iter_t where, void* data);

/**
 * @brief Remove an element from the list.
 * @discription This function removes the element at the given iterator.
 * @param iter The iterator pointing to the element to remove.
 * @return The iterator after the removed element.
 * @time complexity: O(1)
 * @space complexity: O(1)
 */
sll_iter_t SLLRemove(sll_iter_t iter);

/**
 * @brief Find an element in the list.
 * @description This function searches for an element that matches a condition.
 * @param from The iterator where to start the search.
 * @param to The iterator where to end the search.
 * @param match The function that defines the matching condition.
 * @param param A parameter to pass to the match function.
 * @return The iterator pointing to the matching element, or the 'to' iterator if not found.
 * @time complexity: O(n)
 * @space complexity: O(1)
 */
sll_iter_t SLLFind(sll_iter_t from, sll_iter_t to, is_match_t match, void* param);

/**
 * @brief Get the beginning iterator of the list.
 * @description This function returns an iterator to the first element of the list.
 * @param list The list from which to get the beginning.
 * @return The beginning iterator.
 * @time complexity: O(1)
 * @space complexity: O(1)
 */
sll_iter_t SLLBegin(const sll_t* list);

/**
 * @brief Get the end iterator of the list.
 * @description This function returns an iterator to the dummy node at the end of the list.
 * @param list The list from which to get the end.
 * @return The end iterator.
 * @time complexity: O(1)
 * @space complexity: O(1)
 */
sll_iter_t SLLEnd(const sll_t* list);

/**
 * @brief Get the next iterator in the list.
 * @description This function returns the next iterator after the current one.
 * @param iter The current iterator.
 * @return The next iterator.
 * @time complexity: O(1)
 * @space complexity: O(1)
 */
sll_iter_t SLLNext(sll_iter_t iter);

/**
 * @brief Get the data stored at the iterator.
 * @description This function returns the data pointer stored in the node.
 * @param iter The iterator to get data from.
 * @return A pointer to the data.
 * @time complexity: O(1)
 * @space complexity: O(1)
 */
void* SLLGetData(sll_iter_t iter);

/**
 * @brief Set new data at the iterator.
 * @description This function updates the data in the node.
 * @param iter The iterator where the data will be updated.
 * @param new_data The new data to set.
 * @return None.
 * @time complexity: O(1)
 * @space complexity: O(1)
 */
void SLLSetData(sll_iter_t iter, void* new_data);

/**
 * @brief Compare two iterators.
 * @description This function checks if two iterators point to the same node.
 * @param iter1 The first iterator.
 * @param iter2 The second iterator.
 * @return Non-zero if both iterators are equal, zero otherwise.
 * @time complexity: O(1)
 * @space complexity: O(1)
 */
int SLLIterIsEqual(sll_iter_t iter1, sll_iter_t iter2);

 /**
 * @brief Appending two singly linked lists.
 * @description This function appends the last element of dest to the last element
 * in src effectively linking them together.
 * Be wary: src is destroyed at the end of this function 
 * @param dest a pointer the destination list.
 * @param src a pointer to the source list.
 * @return None
 * @time complexity: O(1)
 * @space complexity: O(1)
 */
void SLLAppend(sll_t* dest, sll_t* src);

#endif /* _ILRD_SLL_H_ */
