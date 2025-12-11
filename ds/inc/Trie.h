/*
*************************************************************
 *  File        : Trie.h
 *  Author      : Ayal Moran
 *  Reviewer    : Chen Mugany
 *  Date        : 11-12-2025
 **************************************************************/
#ifndef __TRIE_H__
#define __TRIE_H__

#include <stddef.h> /* size_t */
#include <stdint.h> /* int32_t */

typedef struct Trie trie_t;

typedef enum
{
    TRIE_SUCCESS = 0,
    TRIE_ERR_ALLOC,
    TRIE_ERR_FULL
}
trie_status_t;

/*
*
 * @brief Creates a new trie data structure.
 *
 * @param word_len The maximum length of words to be stored in the trie. 
 *        MUST be less than 32.
 * @return Pointer to the newly created trie, or NULL on failure.
 * @note The returned pointer MUST be destroyed using TrieDestroy().
 * @complexity Time: O(1), Space: O(1)
 */
trie_t* TrieCreate(size_t word_len);

/*
*
 * @brief Destroys the trie and frees all associated memory.
 *
 * @param tree Pointer to the trie to be destroyed. 
 *        MUST NOT be NULL.
 * @note After calling this function, the pointer MUST NOT be used.
 * @complexity Time: O(n), Space: O(1), where n is the number of nodes in the trie.
 */
void TrieDestroy(trie_t* tree);

/*
*
 * @brief Inserts a value into the trie.
 *
 * @param tree Pointer to the trie. MUST NOT be NULL.
 * @param to_insert The value to insert.
 * @param inserted[out] Pointer to an int32_t that will be set to the value that
 *        was inserted. MUST NOT be NULL.
 *
 * @return Status code indicating success or failure (see trie_status_t).
 *        TRIE_SUCCESS if the value was inserted successfully.
 *        TRIE_ERR_ALLOC if the value was not inserted because of allocation failure.
 *        TRIE_ERR_FULL if the value was not inserted because the trie is full.
 * @note If the value is already in the trie, the inserted value will be set to 
 *       the first available value.
 * @complexity Time: O(word_len), Space: O(word_len)
 */
trie_status_t TrieInsert(trie_t* tree, int32_t to_insert, int32_t* inserted);

/*
*
 * @brief Removes a value from the trie.
 *
 * @param tree Pointer to the trie. MUST NOT be NULL.
 * @param to_remove The value to remove.
 * @return 0 on success, non-zero on failure.
 * @note Removing a value that does not exist in the trie MUST NOT affect the trie.
 * @complexity Time: O(word_len), Space: O(word_len)
 */
int TrieRemove(trie_t* tree, int32_t to_remove);
/*
*
 * @brief Counts the number of elements stored in the trie.
 *
 * @param tree Pointer to the trie. MUST NOT be NULL.
 * @return The number of elements in the trie.
 * @complexity Time: O(n), Space: O(1), where n is the number of nodes in the trie.
 */
size_t TrieCount(const trie_t* tree);

#endif /* __TRIE_H__ */
