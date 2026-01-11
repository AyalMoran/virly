#define _XOPEN_SOURCE 700

#include <assert.h> /* assert */
#include <limits.h> /* INT_MAX */
#include <pthread.h>/* pthread_create */
#include <stdint.h> /* uint8_t */
#include <stdio.h>  /* printf */
#include <stdlib.h> /* malloc */
#include <string.h> /* memcpy */
#include <time.h>   /* clock */
#include <unistd.h> /* write */

#define MULTIPLIER (10000)

#ifdef NO_FALSE_SHARING
#    define CACHE_LINE_SIZE (64)
#else
#    define CACHE_LINE_SIZE (8)
#endif /*  NO_FALSE_SHARING */

#define CACHE_LINE_PADDING (CACHE_LINE_SIZE / sizeof(size_t))
#define NO_PADDING (0)
#define LUT_SIZE (256)
#define MAX_THREADS (64)
#define PATH_TO_DICT "/usr/share/dict/american-english"
#define START (start_time = clock())
#define END (end_time = clock())

typedef enum mt_count_sort_status
{
    MT_COUNT_SORT_SUCCESS = 0,
    MT_COUNT_SORT_ALLOC_ERR,
    MT_COUNT_SORT_THREAD_ERR
} mt_count_sort_status_t;

typedef struct counter
{
    size_t value;
} padded_arr_t;

typedef struct ctx
{
    char* in_arr;
    size_t size;
    size_t partition_num;
    size_t total_threads;
    padded_arr_t* shared_luts;
} ctx_t;

static void* CountRoutine(void* param);
static int MergeLUTs(padded_arr_t* final_lut, padded_arr_t* all_luts,
                     size_t nthreads);
static void BuildSortedOutput(char* out, padded_arr_t* lut, size_t size);
static size_t GetFileSize(FILE* fp);
static int MakeBigBufferFromDict(char** buffer_out, size_t* size_out,
                                 size_t multiplier);

int MTCountSort(char arr[], size_t size, size_t nthreads, char** out)
{
    size_t total_elements = 0;
    size_t total_size = 0;
    void* raw_ptr = NULL;

    pthread_t threads[MAX_THREADS] = {0};
    ctx_t thread_ctxs[MAX_THREADS] = {0};

    padded_arr_t* all_luts = NULL;
    padded_arr_t final_lut[LUT_SIZE] = {0};
    size_t i = 0;
    size_t j = 0;

    char* sorted = NULL;

    struct timespec start = {0};
    struct timespec finish = {0};
    double elapsed = 0;

    assert(arr);
    assert(nthreads > 0);
    assert(nthreads <= MAX_THREADS);

    total_elements = nthreads * (LUT_SIZE + CACHE_LINE_PADDING);
    total_size = total_elements * sizeof(padded_arr_t);

    if (0 != posix_memalign(&raw_ptr, CACHE_LINE_SIZE, total_size))
    {
        return MT_COUNT_SORT_ALLOC_ERR;
    }

    all_luts = (padded_arr_t*) raw_ptr;
    memset(all_luts, 0, total_size);

    printf("Starting counting sort with %lu threads...\n", nthreads);
    fflush(stdout);
    clock_gettime(CLOCK_MONOTONIC, &start);
    for (i = 0; i < nthreads; ++i)
    {
        thread_ctxs[i].in_arr = arr;
        thread_ctxs[i].size = size;
        thread_ctxs[i].partition_num = i;
        thread_ctxs[i].total_threads = nthreads;
        thread_ctxs[i].shared_luts =
            all_luts + (i * (LUT_SIZE + CACHE_LINE_PADDING));

        if (0 !=
            pthread_create(&threads[i], NULL, CountRoutine, &thread_ctxs[i]))
        {
            fprintf(stderr, "Error creating thread %lu\n", i);
            for (j = 0; j < i; ++j)
            {
                pthread_join(threads[j], NULL);
            }
            free(all_luts);
            return MT_COUNT_SORT_THREAD_ERR;
        }
    }

    for (i = 0; i < nthreads; ++i)
    {
        pthread_join(threads[i], NULL);
    }
    clock_gettime(CLOCK_MONOTONIC, &finish);
    elapsed = (finish.tv_sec - start.tv_sec);
    elapsed += (finish.tv_nsec - start.tv_nsec) / 1000000000.0;

    printf("Counting Completed.\n");
    printf("Counting Time: %f seconds\n", elapsed);
    fflush(stdout);

    MergeLUTs(final_lut, all_luts, nthreads);

    sorted = (char*) malloc(size);
    if (NULL == sorted)
    {
        free(all_luts);
        return MT_COUNT_SORT_ALLOC_ERR;
    }

    BuildSortedOutput(sorted, final_lut, size);

    memcpy(arr, sorted, size);
    *out = sorted;

    free(all_luts);

    return MT_COUNT_SORT_SUCCESS;
}

static void* CountRoutine(void* param)
{
    ctx_t* ctx = (ctx_t*) param;
    size_t start = (ctx->size / ctx->total_threads) * ctx->partition_num;
    size_t end = (ctx->partition_num == ctx->total_threads - 1)
                     ? ctx->size
                     : start + (ctx->size / ctx->total_threads);
    size_t i = 0;
    unsigned char ch = 0;

    for (i = start; i < end; ++i)
    {
        ch = (unsigned char) (ctx->in_arr[i]);
        ++ctx->shared_luts[ch].value;
    }

    return NULL;
}

static int MergeLUTs(padded_arr_t* final_lut, padded_arr_t* all_luts,
                     size_t nthreads)
{
    size_t i = 0;
    size_t thread_num = 0;

    assert(final_lut);
    assert(all_luts);

    for (thread_num = 0; thread_num < nthreads; ++thread_num)
    {
        for (i = 0; i < LUT_SIZE; ++i)
        {
            final_lut[i].value +=
                all_luts[thread_num * (LUT_SIZE + CACHE_LINE_PADDING) + i]
                    .value;
        }
    }

    return MT_COUNT_SORT_SUCCESS;
}

static void BuildSortedOutput(char* out, padded_arr_t* lut, size_t size)
{
    size_t i = 0;
    size_t out_index = 0;
    size_t count = 0;

    assert(out);
    assert(lut);

    for (i = 0; i < LUT_SIZE; ++i)
    {
        /*
        printf("Character '%c' : %lu occurrences\n", (char) i, lut[i].value);
        */
        count = lut[i].value;

        while (0 < count)
        {
            out[out_index] = (unsigned char) i;
            ++out_index;
            --count;
        }
    }
    printf("Total sorted size: %lu bytes\n", out_index);
}

/*------------- Dictionary Exercise ---------------------*/
int SortDictEx2(size_t nthreads, char** out, size_t* out_size)
{
    size_t size = 0;
    char* buffer = NULL;
    int status = 0;

    status = MakeBigBufferFromDict(&buffer, &size, MULTIPLIER);
    if (0 != status)
    {
        return status;
    }
    printf("Made big buffer from dictionary\n");
    status = MTCountSort(buffer, size, nthreads, out);
    if (0 != status)
    {
        free(buffer);
        return status;
    }

    free(buffer);
    /* write(STDOUT_FILENO, buffer, size);*/
    
    return 0;
}

static int ReadDictToBuffer(char** buffer_out, size_t* size_out)
{
    FILE* fp = NULL;
    char* buffer = NULL;
    size_t file_size = 0;

    assert(buffer_out);
    assert(size_out);

    fp = fopen(PATH_TO_DICT, "r");
    if (NULL == fp)
    {
        return 1;
    }

    file_size = GetFileSize(fp);
    buffer = (char*) malloc(file_size);
    if (NULL == buffer)
    {
        fclose(fp);
        return 1;
    }

    if (file_size != fread(buffer, 1, file_size, fp))
    {
        free(buffer);
        fclose(fp);
        return 1;
    }

    *buffer_out = buffer;
    *size_out = file_size;

    fclose(fp);
    return 0;
}

static size_t GetFileSize(FILE* fp)
{
    size_t size = 0;

    assert(fp);

    fseek(fp, 0L, SEEK_END);
    size = (size_t) ftell(fp);
    rewind(fp);

    return size;
}

static int MakeBigBufferFromDict(char** buffer_out, size_t* size_out,
                                 size_t multiplier)
{
    FILE* fp = NULL;
    char* dict_buf = NULL;
    char* big_buf = NULL;
    size_t dict_size = 0;
    size_t total_size = 0;
    size_t i = 0;

    assert(NULL != buffer_out);
    assert(NULL != size_out);

    fp = fopen(PATH_TO_DICT, "r");
    if (NULL == fp)
    {
        return 1;
    }

    dict_size = GetFileSize(fp);
    printf("The dictionary size is: %lu bytes\n", dict_size);

    dict_buf = (char*) malloc(dict_size);
    if (NULL == dict_buf)
    {
        fclose(fp);
        return 1;
    }

    if (dict_size != fread(dict_buf, 1, dict_size, fp))
    {
        free(dict_buf);
        fclose(fp);
        return 1;
    }

    fclose(fp);

    total_size = dict_size * multiplier;
    big_buf = (char*) malloc(total_size);
    if (NULL == big_buf)
    {
        free(dict_buf);
        return 1;
    }

    for (i = 0; i < multiplier; ++i)
    {
        memcpy(big_buf + i * dict_size, dict_buf, dict_size);
    }
    printf("Total buffer size is: %lu bytes\n", total_size);

    *buffer_out = big_buf;
    *size_out = total_size;

    free(dict_buf);
    return 0;
}
