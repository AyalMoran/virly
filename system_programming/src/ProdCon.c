/**************************************************************
 * File    : ProdCon.c
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

#define _XOPEN_SOURCE 700
/*============================ INCLUDES ============================*/
#include <assert.h>  /* assert */
#include <pthread.h> /* pthread_t */
#include <semaphore.h> /* sem_t */
#include <stddef.h>  /* size_t   */
#include <stdio.h>   /* snprintf */
#include <stdlib.h>  /* malloc */
#include <string.h>  /* memset */
#include <unistd.h>  /* write */

#include "ProdCon.h" /* prod_con_status_t */

#ifdef PHASE2
#include "SL_List.h" /* sll_t */
#endif               /* PHASE2 */

#ifdef PHASE3
#include "SL_List.h" /* sll_t */
#endif               /* PHASE3 */

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
#define NUM_ITEMS (100UL)

#ifdef PHASE2
#define NCONS (4UL)
#define NPROD (4UL)
#endif /* PHASE2 */

#ifdef PHASE3
#define NCONS (4UL)
#define NPROD (4UL)
#endif /* PHASE3 */
/*========================= TYPEDEFS/ENUMS =========================*/
typedef void* (*thread_routine_t)(void* args);
#ifdef PHASE1

typedef struct args1
{
    size_t items;
    int* msg;
    int full;
    #ifdef SYNC_SPIN
    int lock;
    #endif /*SYNC_SPIN*/
    #ifdef PTHREAD_SPIN
    pthread_spinlock_t lock;
    #endif /*PTHREAD_SPIN*/
} args1_t;
#endif /* PHASE1 */

#ifdef PHASE2
typedef struct args2
{
    size_t items;
    pthread_mutex_t mutex;
    sll_t* buffer;
} args2_t;
#endif /* PHASE2 */

#ifdef PHASE3
typedef struct args3
{
    size_t items;
    pthread_mutex_t mutex;
    sem_t sem;
    sll_t* buffer;
} args3_t;
#endif /* PHASE3 */

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
static void* P2(void* args);
static void* C2(void* args);
#ifdef PHASE3
static void* P3(void* args);
static void* C3(void* args);
#endif /* PHASE3 */
static void Consume(int* msg);
static void Produce(int* msg);
static void SafePrint(char* buf, int len);

/*========================= API FUNCTIONS ==========================*/
#ifdef PHASE1
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
#    ifdef SYNC_SPIN
    resource.lock = UNLOCKED;
#    endif /*SYNC_SPIN*/

#    ifdef PTHREAD_SPIN
    pthread_spin_init(&resource.lock, PTHREAD_PROCESS_PRIVATE);
#    endif /*PTHREAD_SPIN*/

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
#endif /* PHASE1 */
#ifdef PHASE2
prod_con_status_t ProdCon()
{
    pthread_t producer[NPROD] = {0};
    pthread_t consumer[NCONS] = {0};
    prod_con_status_t status = PROD_CON_SUCCESS;
    args2_t resource = {
        0,
    };

    resource.items = NUM_ITEMS;
    resource.buffer = SLLCreate();
    if (!resource.buffer)
    {
        return PROD_CON_ALLOC_FAILURE;
    }
    pthread_mutex_init(&resource.mutex, NULL);


    if (PROD_CON_SUCCESS !=
        (status = CreateThreads(producer, NPROD, consumer, NCONS, P2, C2, &resource,
                                &resource)))
    {
        /* free(msg); */
        return status;
    }

    if (PROD_CON_SUCCESS !=
        (status = JoinThreads(producer, NPROD, consumer, NCONS, NULL, NULL)))
    {
       /*  free(msg); */
        return status;
    }
    
    SLLDestroy(resource.buffer);
    pthread_mutex_destroy(&resource.mutex);

    /* free(msg); */

    return status;
}
#endif /* PHASE2 */

#ifdef PHASE3
prod_con_status_t ProdCon()
{
    pthread_t producer[NPROD] = {0};
    pthread_t consumer[NCONS] = {0};
    prod_con_status_t status = PROD_CON_SUCCESS;
    args3_t resource = {
        0,
    };

    resource.items = NUM_ITEMS;
    resource.buffer = SLLCreate();
    if (!resource.buffer)
    {
        return PROD_CON_ALLOC_FAILURE;
    }
    if (0 != pthread_mutex_init(&resource.mutex, NULL))
    {
        SLLDestroy(resource.buffer);
        return PROD_CON_ALLOC_FAILURE;
    }
    if (0 != sem_init(&resource.sem, 0, 0))
    {
        pthread_mutex_destroy(&resource.mutex);
        SLLDestroy(resource.buffer);
        return PROD_CON_ALLOC_FAILURE;
    }

    if (PROD_CON_SUCCESS !=
        (status = CreateThreads(producer, NPROD, consumer, NCONS, P3, C3, &resource,
                                &resource)))
    {
        sem_destroy(&resource.sem);
        pthread_mutex_destroy(&resource.mutex);
        SLLDestroy(resource.buffer);
        return status;
    }

    if (PROD_CON_SUCCESS !=
        (status = JoinThreads(producer, NPROD, consumer, NCONS, NULL, NULL)))
    {
        sem_destroy(&resource.sem);
        pthread_mutex_destroy(&resource.mutex);
        SLLDestroy(resource.buffer);
        return status;
    }
    
    sem_destroy(&resource.sem);
    pthread_mutex_destroy(&resource.mutex);
    SLLDestroy(resource.buffer);

    return status;
}
#endif /* PHASE3 */
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

/*
 * =====================================================================
 * ========================== THREAD ROUTINES ==========================
 * =====================================================================
 */
/*
 * ----------------------------- SYNC SPIN ------------------------
 */
#ifdef PHASE1

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
/*
* ----------------------------- MY SPINLOCK ------------------------
*/
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
/*
* ----------------------------- PTHREAD SPINLOCK ------------------------
*/
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
#endif /* PHASE1 */
#ifdef PHASE2
static void* P2(void* args)
{
    args2_t* ctx = (args2_t*) args;
    size_t i = 0;
    size_t n = 0;
    int* product = 0;

    assert(ctx);
    
    n = ctx->items;
    while (i < n)
    {
        product = (int*) malloc(sizeof(int));
        if (!product)
        {
            continue;
        }

        Produce(product);

        pthread_mutex_lock(&ctx->mutex);
        SLLInsert(SLLEnd(ctx->buffer), product);
        pthread_mutex_unlock(&ctx->mutex);

        ++i;
    }

    return NULL;
}

static void* C2(void* args)
{
    args2_t* ctx = (args2_t*) args;
    size_t i = 0;
    size_t n = 0;

    assert(ctx);

    n = ctx->items;
    while (i < n)
    {
        int* product = NULL;
        sll_iter_t iter = NULL;

        pthread_mutex_lock(&ctx->mutex);
        while (SLLIsEmpty(ctx->buffer))
        {
            pthread_mutex_unlock(&ctx->mutex);
            pthread_mutex_lock(&ctx->mutex);
        }
        iter = SLLBegin(ctx->buffer);
        product = (int*) SLLGetData(iter);
        SLLRemove(iter);
        pthread_mutex_unlock(&ctx->mutex);

        if (product)
        {
            Consume(product);
            free(product);
        }
        ++i;
    }

    return NULL;
}
#endif /* PHASE2 */

#ifdef PHASE3
static void* P3(void* args)
{
    args3_t* ctx = (args3_t*) args;
    size_t i = 0;
    size_t n = 0;
    int* product = 0;

    assert(ctx);
    
    n = ctx->items;
    while (i < n)
    {
        product = (int*) malloc(sizeof(int));
        if (!product)
        {
            continue;
        }

        Produce(product);

        pthread_mutex_lock(&ctx->mutex);
        SLLInsert(SLLEnd(ctx->buffer), product);
        pthread_mutex_unlock(&ctx->mutex);
        
        sem_post(&ctx->sem);

        ++i;
    }

    return NULL;
}

static void* C3(void* args)
{
    args3_t* ctx = (args3_t*) args;
    size_t i = 0;
    size_t n = 0;

    assert(ctx);

    n = ctx->items;
    while (i < n)
    {
        int* product = NULL;
        sll_iter_t iter = NULL;

        sem_wait(&ctx->sem);

        pthread_mutex_lock(&ctx->mutex);
        iter = SLLBegin(ctx->buffer);
        product = (int*) SLLGetData(iter);
        SLLRemove(iter);
        pthread_mutex_unlock(&ctx->mutex);

        if (product)
        {
            Consume(product);
            free(product);
        }
        ++i;
    }

    return NULL;
}
#endif /* PHASE3 */