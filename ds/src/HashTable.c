
/**************************************************************
 *  File        : HashTable.c
 *  Author      : Ayal Moran
 *  Reviewer    :
 *  Date        :
 **************************************************************/

#include <assert.h> /* assert() */
#include <stdlib.h> /* malloc() */

/*
 *============================ INCLUDES ============================*/
#include "DLL.h"
#include "HashTable.h"

/*
 *========================== DEFINITIONS ===========================*/
#define TRUE (1)
#define FALSE (0)
#define SUCCESS (0)
#define FAILURE (1)

/*
 *========================== MACRO UTILS ===========================*/

/*
 *========================= TYPEDEFS/ENUMS =========================*/
struct HashTable
{
    hash_func_t hash_func;
    hash_is_match_t is_match;
    size_t capacity;
    dllist_t* buckets[1];
};

typedef int (*bucket_callback_t)(const dllist_t* bucket, void* param);
/*====================== STATIC DECLARATIONS =======================*/
static int ForEachBucket(hash_table_t* table, bucket_callback_t callback,
                         void* param);
static void DestroyLists(dllist_t** lists, size_t num_lists);
static hash_table_t* InitTable(hash_table_t* table, size_t capacity,
                               hash_func_t hash_func, hash_is_match_t is_match);
static int IsMatchAdapter(const void* data, void* param);
static dll_iter_t PackAndFind(const hash_table_t* table, const void* key,
                              void* param);
static int IsEmptyHelper(const dllist_t* list, void* param);
static int CountHelper(const dllist_t* list, void* param);

/*
 *========================= API FUNCTIONS ==========================*/
hash_table_t* HashTableCreate(size_t capacity, hash_func_t hash_func,
                              hash_is_match_t is_match)
{
    hash_table_t* table = NULL;

    assert(NULL != hash_func);
    assert(NULL != is_match);

    table = (hash_table_t*) malloc(sizeof(hash_table_t) +
                                   capacity * sizeof(dllist_t*));
    if (NULL == table)
    {
        return NULL;
    }

    return InitTable(table, capacity, hash_func, is_match);
}

void HashTableDestroy(hash_table_t* table)
{
    assert(NULL != table);

    DestroyLists(table->buckets, table->capacity);
    free(table);
}

int HashTableInsert(hash_table_t* table, const void* key, const void* value)
{
    size_t index = 0;
    dllist_t* bucket = NULL;

    assert(NULL != table);

    index = table->hash_func(key) % table->capacity;
    bucket = table->buckets[index];

    return DLLIterIsEqual(DLLEnd(bucket), DLLPushFront(bucket, value));
}

typedef struct pack
{
    const hash_table_t* table;
    const void* key;
    void* param;
} pack_t;

void* HashTableRemove(hash_table_t* table, const void* key, void* param)
{
    size_t index = 0;
    dllist_t* bucket = NULL;
    dll_iter_t found_iter = {0};
    void* found_data = NULL;

    assert(NULL != table);

    index = table->hash_func(key) % table->capacity;
    bucket = table->buckets[index];

    found_iter = PackAndFind(table, key, param);

    if (!DLLIterIsEqual(found_iter, DLLEnd(bucket)))
    {
        found_data = DLLGetData(found_iter);
        DLLRemove(found_iter);
    }

    return found_data;
}

void* HashTableFind(const hash_table_t* table, const void* key, void* param)
{
    size_t index = 0;
    dllist_t* bucket = NULL;
    dll_iter_t found_iter = {0};

    assert(NULL != table);

    index = table->hash_func(key) % table->capacity;
    bucket = table->buckets[index];
    found_iter = PackAndFind(table, key, param);

    return DLLIterIsEqual(found_iter, DLLEnd(bucket)) ? NULL
                                                      : DLLGetData(found_iter);
}

int HashTableIsEmpty(const hash_table_t* table)
{
    assert(table);
    return !ForEachBucket((hash_table_t*) table, IsEmptyHelper, NULL);
}

size_t HashTableSize(const hash_table_t* table)
{
    size_t count = 0;

    assert(table);

    ForEachBucket((hash_table_t*) table, CountHelper, &count);

    return count;
}

int HashTableForEach(hash_table_t* table, hash_callback_t callback, void* param)
{
    dllist_t** lists = NULL;
    int status = SUCCESS;
    size_t i = 0;

    assert(table);
    assert(callback);

    lists = table->buckets;

    while (i < table->capacity && SUCCESS == status)
    {
        status =
            DLLForEach(DLLBegin(lists[i]), DLLEnd(lists[i]), callback, param);
        ++i;
    }

    return status;
}

/*
 *======================= STATIC FUNCTIONS ========================*/
static void DestroyLists(dllist_t** lists, size_t num_lists)
{
    while (0 < num_lists)
    {
        DLLDestroy(lists[num_lists - 1]);
        --num_lists;
    }
}

static hash_table_t* InitTable(hash_table_t* table, size_t capacity,
                               hash_func_t hash_func, hash_is_match_t is_match)
{
    size_t i = 0;
    dllist_t* curr = NULL;

    assert(NULL != table);
    assert(NULL != hash_func);
    assert(NULL != is_match);
    assert(0 != capacity);

    for (i = 0; i < capacity; ++i)
    {
        curr = DLLCreate();
        if (NULL == curr)
        {
            DestroyLists(table->buckets, i);
            free(table);
            return NULL;
        }
        table->buckets[i] = curr;
    }

    table->hash_func = hash_func;
    table->is_match = is_match;
    table->capacity = capacity;

    return table;
}

static int IsMatchAdapter(const void* data, void* param)
{
    pack_t* pack = *(pack_t**) param;
    hash_is_match_t user_is_match_func = NULL;

    assert(NULL != pack);

    user_is_match_func = pack->table->is_match;

    return user_is_match_func(data, pack->key, pack->param);
}

static dll_iter_t PackAndFind(const hash_table_t* table, const void* key,
                              void* param)
{
    size_t index = 0;
    dllist_t* bucket = NULL;
    dll_iter_t found_iter = {0};
    pack_t* param_pack = NULL;

    assert(NULL != table);

    index = table->hash_func(key) % table->capacity;
    bucket = table->buckets[index];

    param_pack = (pack_t*) malloc(sizeof(pack_t));
    if (NULL == param_pack)
    {
        return DLLEnd(bucket);
    }

    param_pack->table = table;
    param_pack->key = key;
    param_pack->param = param;

    found_iter =
        DLLFind(DLLBegin(bucket), DLLEnd(bucket), IsMatchAdapter, &param_pack);

    free(param_pack);
    return found_iter;
}

static int IsEmptyHelper(const dllist_t* list, void* param)
{
    assert(list);
    (void) param;

    return !DLLIsEmpty(list);
}

static int CountHelper(const dllist_t* list, void* param)
{
    assert(list);
    *(size_t*) param += DLLCount(list);

    return 0;
}

static int ForEachBucket(hash_table_t* table, bucket_callback_t callback,
                         void* param)
{
    size_t i = 0;
    int status = 0;

    assert(callback);
    assert(table);

    for (; i < table->capacity && SUCCESS == status; ++i)
    {
        status = callback(table->buckets[i], param);
    }

    return status;
}