/**************************************************************
 * File    : ProdCon.c
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

#define _XOPEN_SOURCE 700
/*============================ INCLUDES ============================*/
#include <assert.h>    /* assert */
#include <pthread.h>   /* pthread_t */
#include <semaphore.h> /* sem_t */
#include <stddef.h>    /* size_t   */
#include <stdio.h>     /* snprintf */
#include <stdlib.h>    /* malloc */
#include <string.h>    /* memset */
#include <unistd.h>    /* write */

#include "ProdCon.h" /* prod_con_status_t */

#ifdef PHASE2
#    include "SL_List.h" /* sll_t */
#endif                   /* PHASE2 */

#ifdef PHASE3
#    include "SL_List.h" /* sll_t */
#endif                   /* PHASE3 */
#ifdef PHASE4
#    include "cbuff.h" /* c_buffer_t */
#endif                 /* PHASE4 */
#ifdef PHASE5
#    include "fsq.h" /* fsq_t */
#endif               /* PHASE5 */

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
#define NUM_ITEMS (5000000UL)

#ifdef PHASE2
#    define NCONS (4UL)
#    define NPROD (4UL)
#endif /* PHASE2 */

#ifdef PHASE3
#    define NCONS (4UL)
#    define NPROD (4UL)
#endif /* PHASE3 */

#ifdef PHASE4
#    define NCONS (10UL)
#    define NPROD (10UL)
#    define BUFFER_CAPACITY (1000UL)
#endif /* PHASE4 */

#ifdef PHASE5
#    define NCONS (10UL)
#    define NPROD (10UL)
#    define BUFFER_CAPACITY (100UL)
#endif /* PHASE5 */

#ifdef PHASE6
#define NO_MORE_VERSIONS (-1)
#    define NCONS (10UL)
#    define NPROD (1UL)
#endif /* PHASE6 */
/*========================= TYPEDEFS/ENUMS =========================*/
typedef void* (*thread_routine_t)(void* args);
#ifdef PHASE1
typedef struct args1
{
    size_t items_to_produce;
    int* msg;
    int full;
#    ifdef SYNC_SPIN
    int lock;
#    endif /*SYNC_SPIN*/
#    ifdef PTHREAD_SPIN
    pthread_spinlock_t lock;
#    endif /*PTHREAD_SPIN*/
} args1_t;
#endif /* PHASE1 */

#ifdef PHASE2
typedef struct args2
{
    size_t items_to_produce;
    size_t consumed;
    pthread_mutex_t mutex;
    sll_t* buffer;
} args2_t;
#endif /* PHASE2 */

#ifdef PHASE3
typedef struct args3
{
    size_t items_to_produce;
    size_t consumed;
    pthread_mutex_t mutex;
    sem_t available_items;
    sll_t* buffer;
} args3_t;
#endif /* PHASE3 */

#ifdef PHASE4
typedef struct fsq
{
    pthread_mutex_t mutex;
    sem_t sem_empty;
    sem_t sem_full;
    c_buffer_t* cb;
    size_t capacity;
} fsq_t;

typedef struct args4
{
    size_t items_to_produce;
    size_t consumed;
    fsq_t fsq;
} args4_t;
#endif /* PHASE4 */

#ifdef PHASE5
typedef struct args5
{
    size_t items_to_produce;
    size_t consumed;
    fsq_t* fsq;
} args5_t;

pthread_mutex_t count_mutex = PTHREAD_MUTEX_INITIALIZER;
#endif /* PHASE5 */

#ifdef PHASE6
typedef struct args6
{
    size_t items_to_produce;
    size_t consumed;
    int product;
    pthread_mutex_t mutex;
    sem_t sem;
    pthread_cond_t cond_var;
    int version;
} args6_t;
#endif /* PHASE6 */

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
#ifdef PHASE4
static void* P4(void* args);
static void* C4(void* args);
static int ReleaseConsumers(fsq_t* fsq);
#endif /* PHASE4 */
#ifdef PHASE5
static void* P5(void* args);
static void* C5(void* args);
#endif /* PHASE5 */
#ifdef PHASE6
static void* P6(void* args);
static void* C6(void* args);
#endif /* PHASE6 */
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
    resource.items_to_produce = NUM_ITEMS;
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

    resource.items_to_produce = NUM_ITEMS;
    resource.consumed = 0;
    resource.buffer = SLLCreate();
    if (!resource.buffer)
    {
        return PROD_CON_ALLOC_FAILURE;
    }
    pthread_mutex_init(&resource.mutex, NULL);

    if (PROD_CON_SUCCESS !=
        (status = CreateThreads(producer, NPROD, consumer, NCONS, P2, C2,
                                &resource, &resource)))
    {
        return status;
    }

    if (PROD_CON_SUCCESS !=
        (status = JoinThreads(producer, NPROD, consumer, NCONS, NULL, NULL)))
    {
        return status;
    }

    SLLDestroy(resource.buffer);
    pthread_mutex_destroy(&resource.mutex);


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

    resource.items_to_produce = NUM_ITEMS;
    resource.consumed = 0;
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
    if (0 != sem_init(&resource.available_items, 0, 0))
    {
        pthread_mutex_destroy(&resource.mutex);
        SLLDestroy(resource.buffer);
        return PROD_CON_ALLOC_FAILURE;
    }

    if (PROD_CON_SUCCESS !=
        (status = CreateThreads(producer, NPROD, consumer, NCONS, P3, C3,
                                &resource, &resource)))
    {
        sem_destroy(&resource.available_items);
        pthread_mutex_destroy(&resource.mutex);
        SLLDestroy(resource.buffer);
        return status;
    }

    if (PROD_CON_SUCCESS !=
        (status = JoinThreads(producer, NPROD, consumer, NCONS, NULL, NULL)))
    {
        sem_destroy(&resource.available_items);
        pthread_mutex_destroy(&resource.mutex);
        SLLDestroy(resource.buffer);
        return status;
    }

    sem_destroy(&resource.available_items);
    pthread_mutex_destroy(&resource.mutex);
    SLLDestroy(resource.buffer);

    return status;
}
#endif /* PHASE3 */

#ifdef PHASE4
prod_con_status_t ProdCon()
{
    pthread_t producer[NPROD] = {0};
    pthread_t consumer[NCONS] = {0};
    prod_con_status_t status = PROD_CON_SUCCESS;
    args4_t resource = {
        0,
    };

    resource.items_to_produce = NUM_ITEMS;
    resource.consumed = 0;
    resource.fsq.capacity = BUFFER_CAPACITY;

    resource.fsq.cb = CBuffCreate(BUFFER_CAPACITY);
    if (!resource.fsq.cb)
    {
        return PROD_CON_ALLOC_FAILURE;
    }

    if (0 != pthread_mutex_init(&resource.fsq.mutex, NULL))
    {
        CBuffDestroy(resource.fsq.cb);
        return PROD_CON_ALLOC_FAILURE;
    }

    if (0 != sem_init(&resource.fsq.sem_empty, 0, BUFFER_CAPACITY))
    {
        pthread_mutex_destroy(&resource.fsq.mutex);
        CBuffDestroy(resource.fsq.cb);
        return PROD_CON_ALLOC_FAILURE;
    }

    if (0 != sem_init(&resource.fsq.sem_full, 0, 0))
    {
        sem_destroy(&resource.fsq.sem_empty);
        pthread_mutex_destroy(&resource.fsq.mutex);
        CBuffDestroy(resource.fsq.cb);
        return PROD_CON_ALLOC_FAILURE;
    }

    if (PROD_CON_SUCCESS !=
        (status = CreateThreads(producer, NPROD, consumer, NCONS, P4, C4,
                                &resource, &resource)))
    {
        sem_destroy(&resource.fsq.sem_full);
        sem_destroy(&resource.fsq.sem_empty);
        pthread_mutex_destroy(&resource.fsq.mutex);
        CBuffDestroy(resource.fsq.cb);
        return status;
    }

    if (PROD_CON_SUCCESS !=
        (status = JoinThreads(producer, NPROD, consumer, NCONS, NULL, NULL)))
    {
        sem_destroy(&resource.fsq.sem_full);
        sem_destroy(&resource.fsq.sem_empty);
        pthread_mutex_destroy(&resource.fsq.mutex);
        CBuffDestroy(resource.fsq.cb);
        return status;
    }

    sem_destroy(&resource.fsq.sem_full);
    sem_destroy(&resource.fsq.sem_empty);
    pthread_mutex_destroy(&resource.fsq.mutex);
    CBuffDestroy(resource.fsq.cb);

    return status;
}
#endif /* PHASE4 */

#ifdef PHASE5
prod_con_status_t ProdCon()
{
    pthread_t producer[NPROD] = {0};
    pthread_t consumer[NCONS] = {0};
    prod_con_status_t status = PROD_CON_SUCCESS;
    args5_t resource = {
        0,
    };

    resource.items_to_produce = NUM_ITEMS * NCONS;
    resource.consumed = 0;

    resource.fsq = FSQCreate(BUFFER_CAPACITY, NCONS);
    if (!resource.fsq)
    {
        return PROD_CON_ALLOC_FAILURE;
    }

    if (PROD_CON_SUCCESS !=
        (status = CreateThreads(producer, NPROD, consumer, NCONS, P5, C5,
                                &resource, &resource)))
    {
        return status;
    }

    if (PROD_CON_SUCCESS !=
        (status = JoinThreads(producer, NPROD, consumer, NCONS, NULL, NULL)))
    {
        return status;
    }

    FSQDestroy(resource.fsq);
    pthread_mutex_destroy(&count_mutex);

    return status;
}
#endif /* PHASE5 */
#ifdef PHASE6
prod_con_status_t ProdCon()
{
    pthread_t producer[NPROD] = {0};
    pthread_t consumer[NCONS] = {0};
    prod_con_status_t status = PROD_CON_SUCCESS;
    args6_t resource = {
        0,
    };

    resource.items_to_produce = NUM_ITEMS;
    resource.consumed = NCONS;
    resource.version = 0;

    if (0 != pthread_mutex_init(&resource.mutex, NULL))
    {
        return PROD_CON_ALLOC_FAILURE;
    }
    if (0 != sem_init(&resource.sem, 0, 0))
    {
        pthread_mutex_destroy(&resource.mutex);
        return PROD_CON_ALLOC_FAILURE;
    }
    if (0 != pthread_cond_init(&resource.cond_var, NULL))
    {
        sem_destroy(&resource.sem);
        pthread_mutex_destroy(&resource.mutex);
        return PROD_CON_ALLOC_FAILURE;
    }

    if (PROD_CON_SUCCESS !=
        (status = CreateThreads(producer, NPROD, consumer, NCONS, P6, C6,
                                &resource, &resource)))
    {
        pthread_cond_destroy(&resource.cond_var);
        sem_destroy(&resource.sem);
        pthread_mutex_destroy(&resource.mutex);
        return status;
    }

    if (PROD_CON_SUCCESS !=
        (status = JoinThreads(producer, NPROD, consumer, NCONS, NULL, NULL)))
    {
        pthread_cond_destroy(&resource.cond_var);
        sem_destroy(&resource.sem);
        pthread_mutex_destroy(&resource.mutex);
        return status;
    }

    pthread_cond_destroy(&resource.cond_var);
    sem_destroy(&resource.sem);
    pthread_mutex_destroy(&resource.mutex);

    return status;
}
#endif /* PHASE6 */
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

#    ifdef SYNC_SPIN
static void* P1(void* args)
{
    args1_t* ctx = (args1_t*) args;
    size_t i = 0;
    size_t n = 0;

    assert(ctx);

    n = ctx->items_to_produce;
    while (i < n)
    {

        while (__sync_lock_test_and_set(&ctx->lock, LOCKED))
            ;

        if (EMPTY == ctx->full)
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

    n = ctx->items_to_produce;
    while (i < n)
    {
        while (__sync_lock_test_and_set(&ctx->lock, LOCKED))
            ;

        if (FULL == ctx->full)
        {
            Consume(ctx->msg);
            __sync_lock_test_and_set(&ctx->full, EMPTY);
            ++i;
        }

        __sync_lock_release(&ctx->lock);
    }
    return NULL;
}
#    endif /*SYNC_SPIN*/
/*
 * ----------------------------- MY SPINLOCK ------------------------
 */
#    ifdef MY_SPIN_LOCK
static void* P1(void* args)
{
    args1_t* ctx = (args1_t*) args;
    size_t i = 0;
    size_t n = 0;

    assert(ctx);

    n = ctx->items_to_produce;
    while (i < n)
    {
        while (FULL == ctx->full)
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

    n = ctx->items_to_produce;
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
#    endif /*MY_SPIN_LOCK*/
/*
 * ----------------------------- PTHREAD SPINLOCK ------------------------
 */
#    ifdef PTHREAD_SPIN
static void* P1(void* args)
{
    args1_t* ctx = (args1_t*) args;
    size_t i = 0;
    size_t n = 0;

    assert(ctx);

    n = ctx->items_to_produce;
    while (i < n)
    {
        pthread_spin_lock(&ctx->lock);
        while (FULL == ctx->full)
        {
            pthread_spin_unlock(&ctx->lock);
            pthread_spin_lock(&ctx->lock);
        }

        Produce(ctx->msg);
        ++i;
        ctx->full = FULL;
        pthread_spin_unlock(&ctx->lock);
    }

    return NULL;
}

static void* C1(void* args)
{
    args1_t* ctx = (args1_t*) args;
    size_t n = 0;
    size_t i = 0;

    assert(ctx);

    n = ctx->items_to_produce;
    while (i < n)
    {
        pthread_spin_lock(&ctx->lock);
        while (EMPTY == ctx->full)
        {
            pthread_spin_unlock(&ctx->lock);
            pthread_spin_lock(&ctx->lock);
        }

        Consume(ctx->msg);
        ++i;
        ctx->full = EMPTY;
        pthread_spin_unlock(&ctx->lock);
    }
    return NULL;
}

#    endif /*PTHREAD_SPIN*/
#endif     /* PHASE1 */
#ifdef PHASE2
static void* P2(void* args)
{
    args2_t* ctx = (args2_t*) args;
    size_t i = 0;
    size_t n = 0;
    int* product = 0;

    assert(ctx);

    while (TRUE)
    {
        product = (int*) malloc(sizeof(int));
        if (!product)
        {
            continue;
        }

        Produce(product);

        pthread_mutex_lock(&ctx->mutex);
        if (0 == ctx->items_to_produce)
        {
            pthread_mutex_unlock(&ctx->mutex);
            free(product);
            break;
        }
        SLLInsert(SLLEnd(ctx->buffer), product);
        ctx->items_to_produce--;
        pthread_mutex_unlock(&ctx->mutex);
    }

    return NULL;
}

static void* C2(void* args)
{
    args2_t* ctx = (args2_t*) args;

    assert(ctx);

    while (TRUE)
    {
        int* product = NULL;
        sll_iter_t iter = NULL;

        pthread_mutex_lock(&ctx->mutex);
        if (NUM_ITEMS == ctx->consumed)
        {
            pthread_mutex_unlock(&ctx->mutex);
            break;
        }
        while (SLLIsEmpty(ctx->buffer))
        {
            pthread_mutex_unlock(&ctx->mutex);
            pthread_mutex_lock(&ctx->mutex);
        }
        iter = SLLBegin(ctx->buffer);
        product = (int*) SLLGetData(iter);
        SLLRemove(iter);
        ctx->consumed++;
        pthread_mutex_unlock(&ctx->mutex);

        if (product)
        {
            Consume(product);
            free(product);
        }
    }

    return NULL;
}
#endif /* PHASE2 */

#ifdef PHASE3
static void* P3(void* args)
{
    args3_t* ctx = (args3_t*) args;
    int* product = 0;

    assert(ctx);

    while (TRUE)
    {
        product = (int*) malloc(sizeof(int));
        if (!product)
        {
            continue;
        }

        Produce(product);

        pthread_mutex_lock(&ctx->mutex);
        if (0 == ctx->items_to_produce)
        {
            pthread_mutex_unlock(&ctx->mutex);
            free(product);
            sem_post(&ctx->available_items);
            break;
        }
        SLLInsert(SLLEnd(ctx->buffer), product);
        ctx->items_to_produce--;
        pthread_mutex_unlock(&ctx->mutex);

        sem_post(&ctx->available_items);
    }

    return NULL;
}

static void* C3(void* args)
{
    args3_t* ctx = (args3_t*) args;

    assert(ctx);

    while (TRUE)
    {
        int* product = NULL;
        sll_iter_t iter = NULL;

        sem_wait(&ctx->available_items);
        pthread_mutex_lock(&ctx->mutex);
        if (NUM_ITEMS == ctx->consumed)
        {
            pthread_mutex_unlock(&ctx->mutex);
            break;
        }
        iter = SLLBegin(ctx->buffer);
        product = (int*) SLLGetData(iter);
        SLLRemove(iter);
        ctx->consumed++;
        pthread_mutex_unlock(&ctx->mutex);

        if (product)
        {
            Consume(product);
            free(product);
        }
    }

    return NULL;
}
#endif /* PHASE3 */

#ifdef PHASE4
static void* P4(void* args)
{
    args4_t* ctx = (args4_t*) args;
    int* product = 0;

    assert(ctx);

    while (TRUE)
    {
        product = (int*) malloc(sizeof(int));
        if (!product)
        {
            continue;
        }

        Produce(product);

        sem_wait(&ctx->fsq.sem_empty);

        pthread_mutex_lock(&ctx->fsq.mutex);
        if (0 == ctx->items_to_produce)
        {
            pthread_mutex_unlock(&ctx->fsq.mutex);
            ReleaseConsumers(&ctx->fsq);
            free(product);
            break;
        }
        CBuffWrite(ctx->fsq.cb, product, sizeof(int));
        --ctx->items_to_produce;
        pthread_mutex_unlock(&ctx->fsq.mutex);

        sem_post(&ctx->fsq.sem_full);
    }

    return NULL;
}

static void* C4(void* args)
{
    args4_t* ctx = (args4_t*) args;
    int product = 0;

    assert(ctx);

    while (TRUE)
    {
        sem_wait(&ctx->fsq.sem_full);

        pthread_mutex_lock(&ctx->fsq.mutex);
        if (NUM_ITEMS == ctx->consumed)
        {
            pthread_mutex_unlock(&ctx->fsq.mutex);
            sem_post(&ctx->fsq.sem_full);
            break;
        }
        CBuffRead(ctx->fsq.cb, &product, sizeof(int));
        ++(ctx->consumed);
        pthread_mutex_unlock(&ctx->fsq.mutex);

        sem_post(&ctx->fsq.sem_empty);

        Consume(&product);
    }

    return NULL;
}

static int ReleaseConsumers(fsq_t* fsq)
{
    size_t i = 0;

    for (i = 0; i < NCONS; ++i)
    {
        if (ERROR == sem_post(&fsq->sem_full))
        {
            return FAILURE;
        }
    }
}
#endif /* PHASE4 */

#ifdef PHASE5
static void* P5(void* args)
{
    args5_t* ctx = (args5_t*) args;
    int* product = 0;
    fsq_t* fsq = ctx->fsq;
    size_t i = 0;

    size_t items = 0;
    assert(ctx);

    items = ctx->items_to_produce;
    while (TRUE)
    {
        product = (int*) malloc(sizeof(int));
        if (!product)
        {
            continue;
        }

        Produce(product);
#    ifdef TESTING_COUNTER
        pthread_mutex_lock(&count_mutex);
        if (0 == items)
        {
            pthread_mutex_unlock(&count_mutex);
            free(product);
            break;
        }
        --items;
        pthread_mutex_unlock(&count_mutex);
#    endif /* TESTING_COUNTER */

        FSQEnqueue(fsq, product);
    }

    return NULL;
}

static void* C5(void* args)
{
    args5_t* ctx = (args5_t*) args;
    fsq_t* fsq = ctx->fsq;
    void* product = 0;
    int consumed = 0;

    assert(ctx);

    while (TRUE)
    {
#    ifdef TESTING_COUNTER
        pthread_mutex_lock(&count_mutex);
        if (NUM_ITEMS == ctx->consumed)
        {
            pthread_mutex_unlock(&count_mutex);
            break;
        }
        ctx->consumed++;
        pthread_mutex_unlock(&count_mutex);
#    endif /* TESTING_COUNTER */

        FSQDequeue(ctx->fsq, &product);
        ++consumed;

        Consume(product);
        free(product);
    }

    return NULL;
}
#endif /* PHASE5 */
#ifdef PHASE6
static void* P6(void* args)
{
    args6_t* ctx = (args6_t*) args;
    size_t i = 0;
    int product = 0;
    size_t items_to_produce = NUM_ITEMS;

    assert(ctx);

    while (items_to_produce > 0)
    {
        for (i = 0; i < NCONS; ++i)
        {
            sem_wait(&ctx->sem);
        }

        Produce(&product);
        --items_to_produce;
        
        pthread_mutex_lock(&ctx->mutex);
        ctx->product = product;
        ctx->version += 1;
        pthread_cond_broadcast(&ctx->cond_var);
        pthread_mutex_unlock(&ctx->mutex);
    }
    
    for (i = 0; i < NCONS; ++i)
    {
        sem_wait(&ctx->sem);
    }

    pthread_mutex_lock(&ctx->mutex);
    ctx->version = NO_MORE_VERSIONS;
    pthread_cond_broadcast(&ctx->cond_var);
    pthread_mutex_unlock(&ctx->mutex);
    
    return NULL;
}

static void* C6(void* args)
{
    args6_t* ctx = (args6_t*) args;
    int product = 0;
    int curr_version = 0;
    size_t consumed_count = 0;

    assert(ctx);

    sem_post(&ctx->sem);
    
    curr_version = ctx->version;
    
    while (consumed_count < NUM_ITEMS)
    {
        pthread_mutex_lock(&ctx->mutex);
        while (curr_version == ctx->version)
        {
            if (ctx->version == NO_MORE_VERSIONS)
            {
                pthread_mutex_unlock(&ctx->mutex);
                return NULL;
            }
            pthread_cond_wait(&ctx->cond_var, &ctx->mutex);
        }
        curr_version = ctx->version;
        product = ctx->product;
        pthread_mutex_unlock(&ctx->mutex);
        
        Consume(&product);
        consumed_count++;
        
        sem_post(&ctx->sem);
    }

    return NULL;
}
#endif /* PHASE6 */