/**************************************************************
 * File    : MTShuffleAndSort.c
 * Author  : Ayal Moran
 * Reviewer: Daniel N.
 * Date    :14-01-2026
 **************************************************************/
#define _POSIX_C_SOURCE 200809L
#include <assert.h>  /* assert */
#include <pthread.h> /* pthread_t */
#include <stdio.h>   /* printf */
#include <stdlib.h>  /* malloc */
#include <string.h>  /* memcpy */
#include <time.h>    /* time */
/*============================ INCLUDES ============================*/
#include "MTShuffleAndSort.h" /* ShuffleSortDictionary */

/*========================== DEFINITIONS ===========================*/
#define TRUE (1)
#define FALSE (0)
#define SUCCESS (0)
#define FAILURE (1)

/*========================== MACRO UTILS ===========================*/
#define PATH_TO_DICT "/usr/share/dict/american-english"
#define MAX_WORD (1024)
/*========================= TYPEDEFS/ENUMS =========================*/
typedef struct thread_ctx
{
    size_t start;
    size_t end;
    char** dict;
} thread_ctx_t;
/*====================== STATIC DECLARATIONS =======================*/
static int MakeBigBufferFromDict(char*** buffer_out, size_t* size_out,
                                 size_t multiplier);
static size_t CountLines(FILE* fptr);
static char*** MultiplyWords(char** words, size_t multiplier, size_t lines);
static void DestroyCopies(char*** copies, size_t size);
static void DestroyWords(char** words);
static void DestroyCopiesArrays(char*** copies, size_t multiplier,
                                char** words);
static void PrintWords(char** words, size_t amount_of_words);

static int CopyWords(char** dst, char** src, size_t amount_of_words);
static size_t GetFileSize(FILE* fp);
static void ShuffleWords(char** words, size_t size);
static void Swap(char** a, char** b);
static shuffle_sort_status_t SortDict(char** dict, size_t size,
                                      size_t nthreads);
static int CancelThreads(pthread_t* threads, size_t nthreads);
static void* SortChunk(void* thread_ctx);
static int StringCompare(const void* a, const void* b);
static int IsSorted(char** words, size_t size);
/*========================= API FUNCTIONS ==========================*/
int ShuffleSortDictionary(size_t multiplier, size_t nthreads)
{
    char** words_p = NULL;
    size_t size = 0;
    size_t i = 0;
    struct timespec start = {0};
    struct timespec finish = {0};
    double elapsed = 0;

    if (SUCCESS != MakeBigBufferFromDict(&words_p, &size, multiplier))
    {
        return FAILURE;
    }

    printf("Shuffling %lu words...\n", size);
    ShuffleWords(words_p, size);
    printf("Starting to sort with %lu threads\n", nthreads);
    fflush(stdout);

    clock_gettime(CLOCK_MONOTONIC, &start);
    SortDict(words_p, size, nthreads);
    clock_gettime(CLOCK_MONOTONIC, &finish);

    elapsed = (finish.tv_sec - start.tv_sec);
    elapsed += (finish.tv_nsec - start.tv_nsec) / 1000000000.0;

    printf("Counting Completed.\n");
    printf("Counting Time: %f seconds\n", elapsed);

    if (!IsSorted(words_p, size))
    {
        return FAILURE;
    }

    for (i = 0; i < size; ++i)
    {
        free(words_p[i]);
        words_p[i] = NULL;
    }
    free(words_p);

    return SUCCESS;
}
/*======================= STATIC FUNCTIONS ========================*/
static void PrintWords(char** words, size_t amount_of_words)
{
    size_t i = 0;

    for (i = 0; i < amount_of_words; ++i)
    {
        if (NULL == words[i])
        {
            continue;
        }
        printf("%s\n", words[i]);
    }
}

static int MakeBigBufferFromDict(char*** buffer_out, size_t* size_out,
                                 size_t multiplier)
{
    FILE* fp = NULL;

    char*** copies = NULL;
    char** words = NULL;
    char** big_buf = NULL;

    size_t dict_size = 0;
    size_t lines = 0;
    size_t curr_word = 0;
    ssize_t curr_word_size = 0;
    size_t allocated_size = 0;
    size_t i = 0;
    size_t j = 0;

    assert(NULL != buffer_out);
    assert(NULL != size_out);

    fp = fopen(PATH_TO_DICT, "r");
    if (NULL == fp)
    {
        return FAILURE;
    }

    lines = CountLines(fp);
    big_buf = (char**) malloc(sizeof(char*) * ((lines + 1) * multiplier));
    if (NULL == big_buf)
    {
        return FAILURE;
    }

    words = (char**) malloc((lines + 1) * sizeof(char*));
    if (NULL == words)
    {
        fclose(fp);
        free(big_buf);

        return FAILURE;
    }

    for (i = 0; i < lines + 1; ++i)
    {
        words[i] = NULL;
    }

    while (curr_word < lines &&
           -1 != (curr_word_size =
                      getline(&words[curr_word], &allocated_size, fp)))
    {
        words[curr_word][curr_word_size - 1] = '\0';
        ++curr_word;
    }

    fclose(fp);
    words[curr_word] = NULL;

    copies = MultiplyWords(words, multiplier, lines);

    i = 0;
    for (j = 0; j < multiplier; ++j)
    {
        for (curr_word = 0; curr_word < lines + 1; ++curr_word)
        {
            big_buf[i] = copies[j][curr_word];
            ++i;
        }
    }
    DestroyCopiesArrays(copies, multiplier, words);

    *buffer_out = big_buf;
    *size_out = i;
    return SUCCESS;
}

static size_t CountLines(FILE* fptr)
{
    char buffer[MAX_WORD];
    size_t lines_ret = 0;
    while (NULL != fgets(buffer, sizeof(buffer), fptr))
    {
        ++lines_ret;
    }
    rewind(fptr);
    return lines_ret;
}

static char*** MultiplyWords(char** words, size_t multiplier, size_t lines)
{
    char*** copies = NULL;
    size_t i = 0;

    assert(multiplier > 1);
    assert(words);

    copies = (char***) malloc(sizeof(char**) * multiplier);
    if (NULL == copies)
    {
        return NULL;
    }

    copies[0] = words;
    for (i = 1; i < multiplier; ++i)
    {
        copies[i] = (char**) malloc((lines + 1) * (sizeof(char*)));
        if (NULL == copies[i])
        {
            DestroyCopies(copies, i);

            return NULL;
        }
        if (SUCCESS != CopyWords(copies[i], copies[0], lines))
        {
            DestroyCopies(copies, i);
            return NULL;
        }
    }
    return copies;
}

static int CopyWords(char** dst, char** src, size_t amount_of_words)
{
    size_t curr_word = 0;

    assert(dst);
    assert(src);

    for (curr_word = 0; curr_word < amount_of_words; ++curr_word)
    {
        if (NULL == src[curr_word])
        {
            dst[curr_word] = NULL;
            continue;
        }
        dst[curr_word] = strdup(src[curr_word]);
        if (NULL == dst[curr_word])
        {
            return FAILURE;
        }
    }
    dst[curr_word] = NULL;

    return SUCCESS;
}
static void DestroyCopies(char*** copies, size_t size)
{
    size_t i = 0;

    assert(copies);

    for (i = 0; i < size; ++i)
    {
        DestroyWords(copies[i]);
    }
}

static void DestroyWords(char** words)
{
    size_t i = 0;

    while (NULL != words[i])
    {
        free(words[i]);
        ++i;
    }
}

static void DestroyCopiesArrays(char*** copies, size_t multiplier, char** words)
{
    size_t i = 0;

    assert(copies);
    assert(words);

    for (i = 1; i < multiplier; ++i)
    {
        free(copies[i]);
    }

    free(words);
    free(copies);
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

static void ShuffleWords(char** words, size_t size)
{
    size_t i = 0;
    size_t j = 0;

    for (i = size - 1; i > 0; --i)
    {
        srand((unsigned int) time(NULL) + (unsigned int) i);
        j = rand() % (i + 1);
        Swap(&words[i], &words[j]);
    }
}

static int StringCompare(const void* a, const void* b)
{
    if (NULL == *((const char**) a))
    {
        return -1;
    }
    else if (NULL == *((const char**) b))
    {
        return 1;
    }
    return strcmp(*(const char**) a, *(const char**) b);
}

static void Swap(char** a, char** b)
{
    char* temp = *a;
    *a = *b;
    *b = temp;
}

static shuffle_sort_status_t SortDict(char** dict, size_t size, size_t nthreads)
{
    pthread_t* threads = NULL;
    thread_ctx_t* thread_ctx = NULL;
    size_t i = 0;

    threads = (pthread_t*) malloc(sizeof(pthread_t) * nthreads);
    if (NULL == threads)
    {
        return ALLOC_FAILURE;
    }

    thread_ctx = (thread_ctx_t*) malloc(sizeof(thread_ctx_t) * nthreads);
    if (NULL == thread_ctx)
    {
        free(threads);
        return ALLOC_FAILURE;
    }

    while (nthreads > 0)
    {
        for (i = 0; i < nthreads; ++i)
        {
            thread_ctx[i].dict = dict;
            thread_ctx[i].start = i * size / nthreads;
            thread_ctx[i].end = (i + 1) * size / nthreads;
            if (SUCCESS !=
                pthread_create(&threads[i], NULL, SortChunk, &thread_ctx[i]))
            {
                CancelThreads(threads, i - 1);
                return THREAD_FAILURE;
            }
        }

        for (i = 0; i < nthreads; ++i)
        {
            pthread_join(threads[i], NULL);
        }
        nthreads /= 2;
    }
    free(threads);
    free(thread_ctx);

    return SUCCESS;
}

static void* SortChunk(void* thread_ctx)
{
    thread_ctx_t* ctx = (thread_ctx_t*) thread_ctx;

    qsort(ctx->dict + ctx->start, ctx->end - ctx->start, sizeof(char*),
          StringCompare);

    return NULL;
}

static int CancelThreads(pthread_t* threads, size_t nthreads)
{
    size_t i = 0;

    for (i = 0; i < nthreads; ++i)
    {
        if (SUCCESS != pthread_cancel(threads[i]))
        {
            perror("No thread could be found.");
            return FAILURE;
        }
    }

    return SUCCESS;
}

static int IsSorted(char** words, size_t size)
{
    size_t i = 0;

    for (i = 0; i < size - 1; ++i)
    {
        if (StringCompare(&words[i], &words[i + 1]) > 0)
        {
            return FALSE;
        }
    }
    return TRUE;
}