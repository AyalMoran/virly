
/**************************************************************
 * File    : 100KThreads.c
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

#include <assert.h> /* assert() */
#include <errno.h>  /* errno    */
#include <pthread.h>
#include <stddef.h> /* size_t   */
#include <stdio.h>  /* perror   */
#include <stdlib.h> /* malloc() */
#include <string.h> /* memset() */
#include <unistd.h> /* sleep()  */
#include <omp.h>


/*============================ INCLUDES ============================*/
#include "100KThreads.h"

/*========================== DEFINITIONS ===========================*/

#define TRUE (1)
#define FALSE (0)
#define SUCCESS (0)
#define FAILURE (1)

#define NUMBER_TO_CHECK (100000000000UL)
#define INTERVAL_TO_CHECK (5000000000UL)
/*========================== MACRO UTILS ===========================*/

/*========================= TYPEDEFS/ENUMS =========================*/

typedef enum ilrd_thread_status
{
    THREAD_SUCCESS = 0,
    THREAD_ALLOC_FAILURE = 1,
    THREAD_INVALID_INPUT = 2,
    THREAD_JOIN_FAILURE = 3

} ilrd_thread_status_t;

typedef struct args
{
    int i;
    size_t min;
    size_t max;
} args_t;

int* global_arr = NULL;

/*====================== STATIC DECLARATIONS =======================*/
static void* ThreadRoutine(void* args);
static void SleepAndCheckArr(size_t sec_to_sleep, size_t nthreads);
static int CreateThreads(size_t nthreads);
#ifdef PHASE_4
static size_t SumOfDivisors(size_t min, size_t max, size_t n);
static size_t JoinThreads(pthread_t* thread_pool, size_t nthreads);
#endif
#ifdef PHASE_5
static size_t SumOfDivisors(size_t min, size_t max, size_t n);
#endif
/*========================= API FUNCTIONS ==========================*/
int main(int argc, char** argv)
{
    int i = 1;
    if (2 != argc)
    {
        fprintf(stderr, "Usage: %s <num_of_threads>\n", argv[0]);
        return THREAD_ALLOC_FAILURE;
    }
    printf("Starting threads... PID: %d\n", getpid());
    while (i > 0)
    {
        printf("Running in %d...\n", i);
        sleep(1);
        --i;
    }
    return CreateThreads((size_t) atoi(argv[1]));
}
#ifdef PHASE_1
static int CreateThreads(size_t nthreads)
{
    pthread_t* thread_pool = NULL;
    int i = 0;
    args_t* args_pack = 0;

    assert(0 < nthreads);

    thread_pool = (pthread_t*) calloc(sizeof(pthread_t), nthreads);
    if (NULL == thread_pool)
    {
        perror("thread_pool malloc failure\n");

        return THREAD_ALLOC_FAILURE;
    }

    global_arr = (int*) calloc(nthreads, sizeof(int));
    if (NULL == global_arr)
    {
        perror("global arr calloc failure\n");
        free(thread_pool);

        return THREAD_ALLOC_FAILURE;
    }

    for (i = 0; (size_t) i < nthreads; ++i)
    {
        args_pack = (args_t*) malloc(sizeof(args_t));
        if (NULL == args_pack)
        {
            perror("args_pack malloc failure\n");
            free(thread_pool);
            free(global_arr);
            return THREAD_ALLOC_FAILURE;
        }
        args_pack->i = i;
        pthread_create(&thread_pool[i], NULL, ThreadRoutine, args_pack);
    }

    SleepAndCheckArr(10, nthreads);
    free(thread_pool);

    return THREAD_SUCCESS;
}
#endif
#ifdef PHASE_2
static int CreateThreads(size_t nthreads)
{
    pthread_t* thread_pool = NULL;
    int i = 0;
    int ret = 0;
    size_t try_number = 1;
    args_t* args_pack = 0;

    assert(0 < nthreads);

    thread_pool = (pthread_t*) calloc(sizeof(pthread_t), nthreads);
    if (NULL == thread_pool)
    {
        perror("thread_pool malloc failure\n");

        return THREAD_ALLOC_FAILURE;
    }

    global_arr = (int*) calloc(nthreads, sizeof(int));
    if (NULL == global_arr)
    {
        perror("global arr calloc failure\n");
        free(thread_pool);

        return THREAD_ALLOC_FAILURE;
    }

    for (i = 0; (size_t) i < nthreads; ++i)
    {
        args_pack = (args_t*) malloc(sizeof(args_t));
        if (NULL == args_pack)
        {
            perror("args_pack malloc failure\n");
            free(thread_pool);
            free(global_arr);
            return THREAD_ALLOC_FAILURE;
        }
        args_pack->i = i;

        ret = pthread_create(&thread_pool[i], NULL, ThreadRoutine, args_pack);
        while (THREAD_SUCCESS != ret)
        {
            ret =
                pthread_create(&thread_pool[i], NULL, ThreadRoutine, args_pack);
            printf("pthread_create failed on index %d\n", i);
            printf("errno: %d\n", errno);
            printf("strerror: %s\n", strerror(errno));
            printf("Trying again... Try number %lu\n", try_number);
            ++try_number;
        }
    }

    SleepAndCheckArr(10, nthreads);
    free(thread_pool);

    return THREAD_SUCCESS;
}
#endif
#ifdef PHASE_3
static int CreateThreads(size_t nthreads)
{
    pthread_t* thread_pool = NULL;
    int i = 0;
    int ret = 0;
    size_t try_number = 1;
    args_t* args_pack = 0;

    assert(0 < nthreads);

    thread_pool = (pthread_t*) calloc(sizeof(pthread_t), nthreads);
    if (NULL == thread_pool)
    {
        perror("thread_pool malloc failure\n");

        return THREAD_ALLOC_FAILURE;
    }

    global_arr = (int*) calloc(nthreads, sizeof(int));
    if (NULL == global_arr)
    {
        perror("global arr calloc failure\n");
        free(thread_pool);

        return THREAD_ALLOC_FAILURE;
    }

    for (i = 0; (size_t) i < nthreads; ++i)
    {
        args_pack = (args_t*) malloc(sizeof(args_t));
        if (NULL == args_pack)
        {
            perror("args_pack malloc failure\n");
            free(thread_pool);
            free(global_arr);
            return THREAD_ALLOC_FAILURE;
        }
        args_pack->i = i;

        ret = pthread_create(&thread_pool[i], NULL, ThreadRoutine, args_pack);
        while (THREAD_SUCCESS != ret)
        {
            ret =
                pthread_create(&thread_pool[i], NULL, ThreadRoutine, args_pack);
            printf("pthread_create failed on index %d\n", i);
            printf("errno: %d\n", errno);
            printf("strerror: %s\n", strerror(errno));
            printf("Trying again... Try number %lu\n", try_number);
            ++try_number;
        }
        pthread_detach(thread_pool[i]);
    }

    SleepAndCheckArr(10, nthreads);
    free(thread_pool);

    return THREAD_SUCCESS;
}
#endif
#ifdef PHASE_4
static int CreateThreads(size_t nthreads)
{
    pthread_t* thread_pool = NULL;
    int i = 0;
    int ret = 0;
    size_t result = 0;
    size_t try_number = 1;
    args_t* args_pack = 0;

    assert(0 < nthreads);

    nthreads = NUMBER_TO_CHECK / INTERVAL_TO_CHECK;
    printf("Creating %lu threads\n", nthreads);

    thread_pool = (pthread_t*) calloc(nthreads, sizeof(pthread_t));
    if (NULL == thread_pool)
    {
        perror("thread_pool calloc failure\n");
        return THREAD_ALLOC_FAILURE;
    }

    for (i = 0; (size_t) i < nthreads; ++i)
    {
        args_pack = (args_t*) malloc(sizeof(args_t));
        if (NULL == args_pack)
        {
            perror("args_pack malloc failure\n");
            free(thread_pool);
            return THREAD_ALLOC_FAILURE;
        }

        args_pack->min = i * INTERVAL_TO_CHECK + 1;
        args_pack->max = (i + 1) * INTERVAL_TO_CHECK;

        try_number = 1;
        thread_pool[i] = 0;
        ret = pthread_create(&thread_pool[i], NULL, ThreadRoutine, args_pack);
        while (THREAD_SUCCESS != ret)
        {
            printf("pthread_create failed on index %d\n", i);
            printf("errno: %d\n", errno);
            printf("strerror: %s\n", strerror(errno));
            printf("Trying again... Try number %lu\n", try_number);
            ++try_number;
            thread_pool[i] = 0;
            ret =
                pthread_create(&thread_pool[i], NULL, ThreadRoutine, args_pack);
        }
    }

    result = JoinThreads(thread_pool, nthreads);
    printf("Sum of divisors of %ld: %ld\n", NUMBER_TO_CHECK, result);

    free(thread_pool);
    return THREAD_SUCCESS;
}
#endif /* PHASE_4 */
#ifdef PHASE_5
static int CreateThreads(size_t nthreads)
{
    size_t result = 0;
    size_t min = 1;
    size_t max = NUMBER_TO_CHECK;

    omp_set_num_threads((int)nthreads);
    printf("Calculating sum of divisors using %lu OpenMP threads...\n", nthreads);
    
    result = SumOfDivisors(min, max, NUMBER_TO_CHECK);
    
    printf("Sum of divisors of %lu: %lu\n", NUMBER_TO_CHECK, result);

    return THREAD_SUCCESS;
}
#endif /* PHASE_5 */
/*======================= STATIC FUNCTIONS ========================*/
static void SleepAndCheckArr(size_t sec_to_sleep, size_t nthreads)
{
    int i = 0;

    sleep(sec_to_sleep);
    while ((size_t) i < nthreads)
    {
        if (global_arr[i] != i)
        {
            printf("ERROR: Index %d not equal\n", i);
            return;
        }
        ++i;
    }
    printf("All Good!\n");
}

static void* ThreadRoutine(void* args)
{
    args_t* pack = (args_t*) args;
    size_t min = pack->min;
    size_t max = pack->max;
    size_t i = 0;
    size_t sum_of_divisors = 0;

    assert(NULL != pack);

#ifndef PHASE_4
    global_arr[pack->i] = pack->i;
#endif

#    ifdef PHASE_4
    sum_of_divisors = SumOfDivisors(min, max, NUMBER_TO_CHECK);
    free(pack);
    return (void*) (sum_of_divisors + 1);    
#    endif

    free(pack);
    return NULL;
}

#    ifdef PHASE_4
static size_t SumOfDivisors(size_t min, size_t max, size_t n)
{
    size_t i = 0;
    size_t sum_of_divisors = 0;

    for (i = min; i <= max; ++i)
    {
        if (n % i == 0)
        {
            sum_of_divisors += i;
        }
    }
    return sum_of_divisors;
}

static size_t JoinThreads(pthread_t* thread_pool, size_t nthreads)
{
    size_t i = 0;
    size_t sum = 0;
    void* curr_sum = NULL;
    int join_result = 0;
    printf("Joining %lu threads...\n", nthreads);
    for (i = 0; i < nthreads; ++i)
    {
        curr_sum = NULL; 
        join_result = pthread_join(thread_pool[i], &curr_sum);
        if (join_result != 0)
        {
            fprintf(stderr, "pthread_join failed for thread %lu: %s\n", i, strerror(join_result));
            return THREAD_JOIN_FAILURE;
        }
        if (NULL == curr_sum)
        {
            fprintf(stderr, "Error: thread %lu returned NULL (thread may have failed)\n", i);
            return THREAD_JOIN_FAILURE;
        }
        sum += ((size_t)curr_sum - 1);
    }
    return sum;
}
#    endif
#    ifdef PHASE_5
static size_t SumOfDivisors(size_t min, size_t max, size_t n)
{
    size_t i = 0;
    size_t sum_of_divisors = 0;

    #pragma omp parallel for reduction(+:sum_of_divisors)
    for (i = min; i <= max; ++i)
    {
        if (n % i == 0)
        {
            sum_of_divisors += i;
        }
    }
    return sum_of_divisors;
}
#    endif