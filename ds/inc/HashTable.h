/*
*************************************************************
* File    : HashTable.c
* Author  : Ayal Moran
* Reviewer:
* Date    :
**************************************************************/
#ifndef _ILRD_HASHTABLE_H
#define _ILRD_HASHTABLE_H

#include <stddef.h> /* size_t */

/*Return hashed key*/
typedef size_t (*hash_func_t)(const void* key);
/* matching data, given key @return  1 if True , 0 if False  */
typedef int (*hash_is_match_t)(const void* data, const void* key, void* param);
/* An operation function. @return  0 - on success, 1 otherwise  */
typedef int (*hash_callback_t)(void* data, void* param);

typedef struct HashTable hash_table_t;

typedef enum hash_table_status
{
    HASH_TABLE_SUCCESS,
    HASH_TABLE_FAILURE
} hash_table_status_t;

/*
 *
 * @brief
 *   Create the Hash Table.
 *
 *   @param capacity - Capacity of the hash table. (must by bigger then 0).
 *   @param hash_func - Ponter to a function that hash the key to the hash
 * table. (must be valid pointer)
 *   @param is_match - Pointer to a function to check match between 2 elements.
 * (must be valid pointer)
 *
 * @note
 *   Time: O(n)
 *
 *   Space: O(n)
 *
 * @return
 *   hash_table_t* - Return pointer to a valid hash_table_t on success, NULL on
 * failure
 */
hash_table_t* HashTableCreate(size_t capacity, hash_func_t hash_func,
                              hash_is_match_t is_match);
/*
 *
 * @brief
 *   Frees the Hash Table memory.
 *
 *  @param table - The hash table.
 *
 * @note
 *   Time: O(n)
 *
 *   Space: O(1)
 */
void HashTableDestroy(hash_table_t* table);

/*
 *
 * @brief
 *   Insert element to the hash table according to key.
 *
 *  @param table - The hash table.
 *   @param key - Key of the element we want to add to the hash table. (must by
 * a valid key, not NULL).
 *   @param value - Value of the element we want to add to the hash table.
 *
 * @note
 *   Time: O(1)
 *
 *   Space: O(1)
 *
 * @return
 *   int - Return status 0 on success, 1 on failure.
 */
int HashTableInsert(hash_table_t* table, const void* key, const void* value);

/*
 *
 * @brief
 *   Remove element from the hash table according to key.
 *
 *  @param table - The hash table.
 *   @param key - Key of the element we want to remove from the hash table.
 * (must by a valid key, not NULL).
 *   @param param - Paramter for matching function.
 *
 * @note
 *   Time: O(n)
 *
 *   Space: O(1)
 *
 * @return
 *   void* - The value of the removed key. (Return NULL if not found).
 */
void* HashTableRemove(hash_table_t* table, const void* key, void* param);

/*
 *
 * @brief:
 *  Find element in the hash table using the matching function.
 *
 *  @param table - The  Hash Table™..
 *   @param key - Key of the element we want to find from the hash table, must
 * by a valid key (not NULL).
 *   @param param - Parameter for the table's match function.
 *
 * @note
 *   Time: O(n)
 *
 *   Space: O(1)
 *
 * @return
 *   void* - The value of the requested key, NULL if not found.
 */
void* HashTableFind(const hash_table_t* table, const void* key, void* param);

/*
 *
 * @brief A boolean function that returns
 *
 *   @param table - The hash table.
 *
 * @note
 *   Time: O(n)
 *
 *   Space: O(1)
 *
 * @return
 *   int - 1 if hash table is empty, 0 otherwise
 */
int HashTableIsEmpty(const hash_table_t* table);

/*
 *
 * @brief Calculates the size of table.
 *
 *   @param table - The Hash Table™.
 *
 *   @note
 *   Time:O(n)
 *
 *   Space:O(1)
 *
 * @return size_t - The number of elements currently in the Hash Table™.
 */
size_t HashTableSize(const hash_table_t* table);

/*
 * @brief Activate a callback function on each of the elements in the Hash
 * Table™.
 *
 *   @param table - A Pointer to a Hash Table™ created by HashTableCreate(3).
 *   @param callback - A function pointer to activate on each element in the
 * hash table.
 *   @param param - Add parameter to function to activate on each element in the
 * hash table.
 *
 * @note @note
 *   Time:O(n)
 *   Space:O(1)
 *
 * @return int - Return status 0 on success, non-zero on failure.
 */
int HashTableForEach(hash_table_t* table, hash_callback_t callback,
                     void* param);

#endif /* _ILRD_HASHTABLE_H */
