#define _XOPEN_SOURCE 700

#include <assert.h>    /* assert                  */
#include <errno.h>     /* errno                   */
#include <pthread.h>   /* pthread_mutex_t         */
#include <semaphore.h> /* sem_t        */
#include <stddef.h>    /* offsetof                */
#include <stdio.h>     /* perror                  */
#include <stdlib.h>    /* malloc                  */
#include <string.h>    /* memset                  */

#include "fsq.h" /* fsq_t                   */

#define FSQ_SUCCESS (0)
#define FSQ_FAILURE (1)

/*--------------------------- struct -----------------------------*/
struct fsq
{
    pthread_mutex_t w_mtx;
    pthread_mutex_t r_mtx;
    sem_t sem_empty;
    sem_t sem_full;
    size_t cap;
    size_t w_i;
    size_t r_i;
    size_t nconsumers; 
    int is_running;
    void* data[1];
};

/*----------------------- static helpers -------------------------*/
static int FSQ_Wait(sem_t* sem)
{
    int rc = 0;

    do
    {
        rc = sem_wait(sem);
    } while ((-1 == rc) && (EINTR == errno));

    return rc;
}
static int ReleaseSemConsumers(size_t nconsumers, sem_t* sem_full)
{

    size_t i = 0;

    for (i = 0; i < nconsumers; ++i)
    {
        if (0 != sem_post(sem_full))
        {
            return FSQ_FAILURE;
        }
    }

    return FSQ_SUCCESS;
}

/*--------------------------- API --------------------------------*/
fsq_t* FSQCreate(size_t capacity, size_t nconsumers)
{
    fsq_t* q = NULL;
    size_t alloc_sz = 0;

    if (0 == capacity)
    {
        return NULL;
    }

    alloc_sz = offsetof(struct fsq, data) + capacity * sizeof(void*);
    q = (fsq_t*) malloc(alloc_sz);
    if (NULL == q)
    {
        return NULL;
    }

    q->cap = capacity;
    q->w_i = 0;
    q->r_i = 0;
    q->nconsumers = nconsumers;
    q->is_running = 1;
    
    if (0 != pthread_mutex_init(&q->w_mtx, NULL))
    {
        free(q);

        perror("pthread_mutex_init w_mtx");
        return NULL;
    }
    if (0 != pthread_mutex_init(&q->r_mtx, NULL))
    {
        (void) pthread_mutex_destroy(&q->w_mtx);

        free(q);

        perror("pthread_mutex_init r_mtx");
        return NULL;
    }
    if (0 != sem_init(&q->sem_empty, 0, capacity))
    {
        (void) pthread_mutex_destroy(&q->r_mtx);
        (void) pthread_mutex_destroy(&q->w_mtx);

        free(q);

        perror("sem_init sem_empty");
        return NULL;
    }
    if (0 != sem_init(&q->sem_full, 0, 0))
    {
        perror("sem_init sem_full");
        (void) sem_destroy(&q->sem_empty);
        (void) pthread_mutex_destroy(&q->r_mtx);
        (void) pthread_mutex_destroy(&q->w_mtx);

        free(q);

        return NULL;
    }

    return q;
}

fsq_status_t FSQDestroy(fsq_t* q)
{
    int status = FSQ_SUCCESS;
    q->is_running = 0;

    assert(NULL != q);

    ReleaseSemConsumers(q->nconsumers, &q->sem_full);

    if (0 != sem_destroy(&q->sem_empty))
    {
        perror("sem_destroy sem_empty");
        status += FSQ_FAILURE;
    }
    if (0 != sem_destroy(&q->sem_full))
    {
        perror("sem_destroy sem_full");
        status += FSQ_FAILURE;
    }
    if (0 != pthread_mutex_destroy(&q->w_mtx))
    {
        fprintf(stderr,"pthread_mutex_destroy w_mtx");
        status += FSQ_FAILURE;
    }
    if (0 != pthread_mutex_destroy(&q->r_mtx))
    {
        fprintf(stderr,"pthread_mutex_destroy r_mtx");
        status += FSQ_FAILURE;
    }

    free(q);
    return status;
}

fsq_status_t FSQEnqueue(fsq_t* q, void* item)
{
    assert(NULL != q);

    if (0 != FSQ_Wait(&q->sem_empty))
    {
        return FSQ_SEM_WAIT_FAILURE;
    }

    if (0 != pthread_mutex_lock(&q->w_mtx))
    {
        (void) sem_post(&q->sem_empty);
        return FSQ_MUTEX_LOCK_FAILURE;
    }

    q->data[q->w_i] = item;
    q->w_i = (q->w_i + 1) % q->cap;

    if (0 != pthread_mutex_unlock(&q->w_mtx))
    {
        (void) sem_post(&q->sem_full);
        return FSQ_MUTEX_UNLOCK_FAILURE;
    }

    if (0 != sem_post(&q->sem_full))
    {
        return FSQ_SEM_POST_FAILURE;
    }

    return FSQ_SUCCESS;
}

fsq_status_t FSQDequeue(fsq_t* q, void** item_out)
{
    assert(NULL != q);
    assert(NULL != item_out);

    if(!q->is_running)
    {
        return FSQ_SUCCESS;
    }
    
    if (0 != FSQ_Wait(&q->sem_full))
    {
        return FSQ_SEM_WAIT_FAILURE;
    }


    if (0 != pthread_mutex_lock(&q->r_mtx))
    {
        (void) sem_post(&q->sem_full);
        return FSQ_MUTEX_LOCK_FAILURE;
    }

    *item_out = q->data[q->r_i];
    q->r_i = (q->r_i + 1) % q->cap;

    if (0 != pthread_mutex_unlock(&q->r_mtx))
    {
        (void) sem_post(&q->sem_empty);
        return FSQ_MUTEX_UNLOCK_FAILURE;
    }

    if (0 != sem_post(&q->sem_empty))
    {
        return FSQ_SEM_POST_FAILURE;
    }

    return FSQ_SUCCESS;
}

size_t FSQCapacity(const fsq_t* q)
{
    assert(NULL != q);
    return q->cap;
}

