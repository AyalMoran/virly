/*
*************************************************************
 *  File        : TrieTest.c
 *  Author      : Ayal Moran
 *  Reviewer    : Chen Mugany
 *  Date        : 11-12-2025
 **************************************************************/
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "Trie.h"
#include "test_utils.h"

/******************************************************
 * START OF ACTUAL TESTS
 ******************************************************/

static void RegisterTests(void);

static void Test_Create(void)
{
    INIT_SUITE(create, "CREATE");

    trie_t* trie = TrieCreate(31);

    RUN_TEST(create, "Create returns non-NULL", trie != NULL);

    TrieDestroy(trie);

    printf("== [%s] %d/%d Passed ==\n", create.name, create.passed,
           create.total);
}

static void Test_Insert(void)
{
    trie_status_t status = TRIE_SUCCESS;
    int32_t result_host = 0;

    INIT_SUITE(insert, "INSERT");

    trie_t* trie = TrieCreate(3); /* only 8 host addresses: 0 to 7 */

    TrieInsert(trie, 5, &result_host);
    TrieInsert(trie, 6, &result_host);
    RUN_TEST(insert,"Size is 2 after 2 allocations", TrieCount(trie) == 2);

    /* Test fallback to minimum free value when 5 and 6 are taken */
    status = TrieInsert(trie, 5, &result_host);
    RUN_TEST(insert, "Fallback to 0 when 5 and 6 taken",
             TRIE_SUCCESS == status && result_host == 0);
    SHOW_INT(result_host);
    status = TrieInsert(trie, 5, &result_host);
    RUN_TEST(insert, "Fallback to 1 when 0,5,6 taken",
             TRIE_SUCCESS == status && result_host == 1);
    status = TrieInsert(trie, 5, &result_host);
    RUN_TEST(insert, "Fallback to 2 when 0,1,5,6 taken",
             TRIE_SUCCESS == status && result_host == 2);
    status = TrieInsert(trie, 5, &result_host);
    RUN_TEST(insert, "Fallback to 3 when 0,1,2,5,6 taken",
             TRIE_SUCCESS == status && result_host == 3);
    status = TrieInsert(trie, 5, &result_host);
    RUN_TEST(insert, "Fallback to 4 when 0,1,2,3,5,6 taken",
             TRIE_SUCCESS == status && result_host == 4);
    status = TrieInsert(trie, 5, &result_host);
    RUN_TEST(insert, "Fallback to 7 when 0,1,2,3,4,5,6 taken",
             TRIE_SUCCESS == status && result_host == 7);
    status = TrieInsert(trie, 5, &result_host);
    RUN_TEST(insert, "TRIE_ERR_FULL when 0,1,2,3,4,5,6,7 taken",
             TRIE_ERR_FULL == status);
    RUN_TEST(insert, "TRIE_ERR_FULL when 0,1,2,3,4,5,6,7 taken",
             TRIE_ERR_FULL == status);
    
    TrieDestroy(trie);

    printf("== [%s] %d/%d Passed ==\n", insert.name, insert.passed,
           insert.total);
}

static void Test_Remove(void)
{
    INIT_SUITE(remove, "REMOVE");

    trie_t* trie = TrieCreate(3); /* only 8 host addresses: 0 to 7 */
    int32_t result_host = 0;
    TrieInsert(trie, 5, &result_host);
    RUN_TEST(remove, "Size is 1 after 1 allocation", TrieCount(trie) == 1);
    SHOW_INT(result_host);
    TrieRemove(trie, 5);
    RUN_TEST(remove, "Size is 0 after 1 removal", TrieCount(trie) == 0);
    TrieRemove(trie, 5);
    RUN_TEST(remove, "Size is 0 after 2 removals", TrieCount(trie) == 0);
    TrieDestroy(trie);
    printf("== [%s] %d/%d Passed ==\n", remove.name, remove.passed,
           remove.total);
}

static void Test_Count(void)
{
    int32_t result_host = 0;
    INIT_SUITE(count, "COUNT");

    trie_t* trie = TrieCreate(3); /* only 8 host addresses: 0 to 7 */

    RUN_TEST(count, "Size is 0 after creation", TrieCount(trie) == 0);
    TrieInsert(trie, 5, &result_host);
    RUN_TEST(count, "Size is 1 after 1 allocation", TrieCount(trie) == 1);
    TrieInsert(trie, 6, &result_host);
    RUN_TEST(count, "Size is 2 after 2 allocations", TrieCount(trie) == 2);
    TrieInsert(trie, 7, &result_host);
    RUN_TEST(count, "Size is 3 after 3 allocations", TrieCount(trie) == 3);
    TrieRemove(trie, 5);
    RUN_TEST(count, "Size is 2 after 1 removal", TrieCount(trie) == 2);
    TrieRemove(trie, 6);
    RUN_TEST(count, "Size is 1 after 2 removals", TrieCount(trie) == 1);
    TrieRemove(trie, 7);
    RUN_TEST(count, "Size is 0 after 3 removals", TrieCount(trie) == 0);
    TrieDestroy(trie);
    printf("== [%s] %d/%d Passed ==\n", count.name, count.passed,
           count.total);
}
int main(void)
{
    int i = 0;

    PRINT_TEST_HEADER("OVERALL");
    printf("===================\n");
    
    RegisterTests();

    for (i = 0; i < test_count; ++i)
    {
        printf("Running Suite: %s\n", test_registry[i].name);
        test_registry[i].func();
    }

    PRINT_SUMMARY();

    return 0;
}

static void RegisterTests(void)
{
    REGISTER_TEST(Test_Create);
    REGISTER_TEST(Test_Insert);
    REGISTER_TEST(Test_Count);
    REGISTER_TEST(Test_Remove);
}