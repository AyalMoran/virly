/**************************************************************
 * File    : ProdCon.c
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

#define _XOPEN_SOURCE 700
/*============================ INCLUDES ============================*/
#include <assert.h> /* assert() */
#include <pthread.h>
#include <stddef.h> /* size_t   */
#include <stdio.h>  /* snprintf() */
#include <stdlib.h> /* malloc() */
#include <string.h> /* memset() */
#include <unistd.h>

#include "ProdCon.h"
/*========================== DEFINITIONS ===========================*/

/*========================== MACRO UTILS ===========================*/

#define TRUE (1)
#define FALSE (0)
#define SUCCESS (0)
#define FAILURE (1)
#define ERROR (-1)
#define LOCKED (1)
#define UNLOCKED (0)
#define FULL (1)
#define EMPTY (0)
#define NUM_ITEMS (9999999UL)
/*========================= TYPEDEFS/ENUMS =========================*/
typedef void* (*thread_routine_t)(void* args);

#ifdef SYNC_SPIN
typedef struct args1
{
    size_t items;
    int* msg;
    int full;
    int lock;
} args1_t;
#endif /*SYNC_SPIN*/
#ifdef MY_SPIN_LOCK
typedef struct args1
{
    size_t items;
    int* msg;
    int full;
} args1_t;
#endif /*MY_SPIN_LOCK*/
#ifdef PTHREAD_SPIN
typedef struct args1
{
    size_t items;
    int* msg;
    int full;
    pthread_spinlock_t lock;
} args1_t;

#endif /*PTHREAD_SPIN*/
/*====================== STATIC DECLARATIONS =======================*/

static int CreateThreads(pthread_t* producers, size_t nproducers,
                         pthread_t* consumers, size_t nconsumers,
                         thread_routine_t producer_func,
                         thread_routine_t consumer_func, void* prod_args,
                         void* cons_args);
static int JoinThreads(pthread_t* producers, size_t nproducers,
                       pthread_t* consumers, size_t nconsumers, void* prod_ret,
                       void* cons_ret);

static void* P1(void* args);
static void* C1(void* args);
static void Consume(int* msg);
static void Produce(int* msg);
static void SafePrint(char* buf, int len);

/*========================= API FUNCTIONS ==========================*/
prod_con_status_t ProdCon()
{
    pthread_t producer = {0};
    pthread_t consumer = {0};
    prod_con_status_t status = PROD_CON_SUCCESS;
    args1_t resource = {
        0,
    };
    int* msg = (int*) malloc(sizeof(int));
    if (!msg)
    {
        return PROD_CON_ALLOC_FAILURE;
    }

    resource.msg = msg;
    resource.full = EMPTY;
    resource.items = NUM_ITEMS;
#ifdef SYNC_SPIN
    resource.lock = UNLOCKED;
#endif /*SYNC_SPIN*/

#ifdef PTHREAD_SPIN
    pthread_spin_init(&resource.lock, PTHREAD_PROCESS_PRIVATE);
#endif /*PTHREAD_SPIN*/

    if (PROD_CON_SUCCESS !=
        (status = CreateThreads(&producer, 1, &consumer, 1, P1, C1, &resource,
                                &resource)))
    {
        free(msg);
        return status;
    }

    if (PROD_CON_SUCCESS !=
        (status = JoinThreads(&producer, 1, &consumer, 1, NULL, NULL)))
    {
        free(msg);
        return status;
    }

    free(msg);

    return status;
}
/*======================= STATIC FUNCTIONS ========================*/
static int CreateThreads(pthread_t* producers, size_t nproducers,
                         pthread_t* consumers, size_t nconsumers,
                         thread_routine_t producer_func,
                         thread_routine_t consumer_func, void* prod_args,
                         void* cons_args)
{
    size_t i = 0;

    assert(producers);
    assert(consumers);
    assert(producer_func);
    assert(consumer_func);

    for (i = 0; i < nproducers; ++i)
    {
        if (0 != pthread_create(&producers[i], NULL, producer_func, prod_args))
        {
            return PROD_CON_CREATE_FAILURE;
        }
    }

    for (i = 0; i < nconsumers; ++i)
    {
        if (0 != pthread_create(&consumers[i], NULL, consumer_func, cons_args))
        {
            return PROD_CON_CREATE_FAILURE;
        }
    }

    return PROD_CON_SUCCESS;
}

#ifdef SYNC_SPIN
static void* P1(void* args)
{
    args1_t* ctx = (args1_t*) args;
    size_t i = 0;
    size_t n = 0;

    assert(ctx);

    n = ctx->items;
    while (i < n)
    {

        while (__sync_lock_test_and_set(&ctx->lock, LOCKED))
            ;

        if (ctx->full == EMPTY)
        {
            Produce(ctx->msg);
            __sync_lock_test_and_set(&ctx->full, FULL);
            ++i;
        }

        __sync_lock_release(&ctx->lock);
    }

    return NULL;
}

static void* C1(void* args)
{
    args1_t* ctx = (args1_t*) args;
    size_t n = 0;
    size_t i = 0;
    assert(ctx);

    n = ctx->items;
    while (i < n)
    {
        while (__sync_lock_test_and_set(&ctx->lock, LOCKED))
            ;

        if (ctx->full == FULL)
        {
            Consume(ctx->msg);
            __sync_lock_test_and_set(&ctx->full, EMPTY);
            ++i;
        }

        __sync_lock_release(&ctx->lock);
    }
    return NULL;
}
#endif /*SYNC_SPIN*/
#ifdef MY_SPIN_LOCK
static void* P1(void* args)
{
    args1_t* ctx = (args1_t*) args;
    size_t i = 0;
    size_t n = 0;

    assert(ctx);

    n = ctx->items;
    while (i < n)
    {
        while (ctx->full == FULL)
            ;

        Produce(ctx->msg);
        ++i;
        __sync_lock_test_and_set(&ctx->full, FULL);
    }

    return NULL;
}

static void* C1(void* args)
{
    args1_t* ctx = (args1_t*) args;
    size_t n = 0;
    size_t i = 0;

    assert(ctx);

    n = ctx->items;
    while (i < n)
    {
        while (EMPTY == ctx->full)
            ;
        Consume(ctx->msg);
        ++i;
        __sync_lock_test_and_set(&ctx->full, EMPTY);
    }
    return NULL;
}
#endif /*MY_SPIN_LOCK*/
#ifdef PTHREAD_SPIN
static void* P1(void* args)
{
    args1_t* ctx = (args1_t*) args;
    size_t i = 0;
    size_t n = 0;

    assert(ctx);

    n = ctx->items;
    while (i < n)
    {
        pthread_spin_lock(&ctx->lock);
        while (ctx->full == FULL)
        {
            pthread_spin_unlock(&ctx->lock);
            pthread_spin_lock(&ctx->lock);
        }

        Produce(ctx->msg);
        ++i;
        ctx->full = FULL;
    }

    return NULL;
}

static void* C1(void* args)
{
    args1_t* ctx = (args1_t*) args;
    size_t n = 0;
    size_t i = 0;

    assert(ctx);

    n = ctx->items;
    while (i < n)
    {
        pthread_spin_lock(&ctx->lock);
        while (ctx->full == EMPTY)
        {
            pthread_spin_unlock(&ctx->lock);
            pthread_spin_lock(&ctx->lock);
        }

        Consume(ctx->msg);
        ++i;
        ctx->full = EMPTY;
    }
    return NULL;
}
#endif /*PTHREAD_SPIN*/
static void Produce(int* msg)
{
    int n = 0;

    char buf[64] = {0};

    static int produced = 0;
    ++produced;
    *msg = produced;
    n = snprintf(buf, sizeof(buf), "Produced %d\n", produced);
    SafePrint(buf, n);
}
static void Consume(int* msg)
{
    char buf[64] = {0};
    int n = snprintf(buf, sizeof(buf), "Consumed %d\n", *msg);
    SafePrint(buf, n);
}

static void SafePrint(char* buf, int len)
{
    if (len > 0)
    {
        assert(ERROR != write(STDOUT_FILENO, buf, (size_t) len));
    }
}

static int JoinThreads(pthread_t* producers, size_t nproducers,
                       pthread_t* consumers, size_t nconsumers, void* prod_ret,
                       void* cons_ret)
{
    size_t i = 0;

    assert(producers);
    assert(consumers);

    for (i = 0; i < nproducers; ++i)
    {
        if (0 != pthread_join(producers[i], prod_ret))
        {
            return PROD_CON_JOIN_FAILURE;
        }
    }

    for (i = 0; i < nconsumers; ++i)
    {
        if (0 != pthread_join(consumers[i], cons_ret))
        {
            return PROD_CON_JOIN_FAILURE;
        }
    }

    return PROD_CON_SUCCESS;
}