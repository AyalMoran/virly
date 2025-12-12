#include <SL_List.h>
#include <d_vector.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

typedef struct padded_list_data
{
    int value;
    char padding[60];
} padded_list_data_t;

typedef struct list_data
{
    int value;
    
} list_data_t;

static int CreateOneMillList(sll_t* list)
{
    size_t i = 0;
    sll_iter_t iter = SLLBegin(list);
    list_data_t* data = NULL;

    for (i = 0; i < 1000000; ++i)
    {
        data = (list_data_t*) malloc(sizeof(list_data_t));
        if (!data)
        {
            perror("list_data_t malloc failed");
            return 1;
        }
        data->value = 1;

        iter = SLLInsert(iter, data);
    }

    return 0;
}

static int CreateOneMillPaddedList(sll_t* list)
{
    size_t i = 0;
    sll_iter_t iter = SLLBegin(list);
    padded_list_data_t* data = NULL;

    for (i = 0; i < 1000000; ++i)
    {
        data = (padded_list_data_t*) malloc(sizeof(padded_list_data_t));
        if (!data)
        {
            perror("list_data_t malloc failed");
            return 1;
        }
        data->value = 1;

        iter = SLLInsert(iter, data);
    }

    return 0;
}

static int CreateOneMillVec(d_vector_t* vec, int* data)
{
    size_t i = 0;
    
    for (i = 0; i < 1000000; ++i)
    {
        if (DVectorPushBack(vec, data) != 0)
        {
            perror("DVectorPushBack failed");
            return 1;
        }
    }

    return 0;
}

typedef struct vec_and_list
{
    d_vector_t* vec;
    sll_t* list;
    sll_t* padded_list;
} vec_and_list_t;

vec_and_list_t CreateOneMillVecAndList()
{
    int data = 1;
    size_t i = 0;
    sll_t* list = NULL;
    sll_t* padded_list = NULL;
    d_vector_t* vec = NULL;
    vec_and_list_t result = {NULL, NULL, NULL};

    /*Create Vector*/
    vec = DVectorCreate(1000000, sizeof(int));
    if (!vec)
    {
        return result;
    }

    data = 1;
    if( 0 != CreateOneMillVec(vec, &data))
    {
        return result;
    }

    /*Create List*/
    list = SLLCreate();
    if (!list)
    {
        DVectorDestroy(vec);
        return result;
    }

    if( 0 != CreateOneMillList(list))
    {
        return result;
    }

    /*Create Padded List*/
    padded_list = SLLCreate();
    if (!padded_list)
    {
        DVectorDestroy(vec);
        SLLDestroy(list);
        return result;
    }

    if( 0 != CreateOneMillPaddedList(padded_list))
    {
        return result;
    }

    result.vec = vec;
    result.list = list;
    result.padded_list = padded_list;
    return result;
}

static int SumVectorElements(d_vector_t* vec)
{
    size_t i = 0;
    int sum = 0;
    int* data = NULL;

    for (i = 0; i < 1000000; ++i)
    {
        data = (int*)DVectorGetAccessToElement(vec, i);
        sum += *data;
    }

    printf("Vector sum: %d\n", sum);
    return sum;
}

static int SumListElements(sll_t* list)
{
    sll_iter_t iter = SLLBegin(list);
    sll_iter_t end = SLLEnd(list);
    int sum = 0;
    list_data_t* data = NULL;

    while (iter != end)
    {
        data = (list_data_t*)SLLGetData(iter);
        sum += data->value;
        iter = SLLNext(iter);
    }

    printf("List sum: %d\n", sum);
    return sum;
}

int main()
{
    clock_t start = 0;
    clock_t end = 0;
    vec_and_list_t container = {0};
    container  = CreateOneMillVecAndList();
    printf("Created one million elements in both vector and list.\n");

    printf("Now timing the vector:\n");
    start = clock();
    SumVectorElements(container.vec);
    end = clock();
    printf("Vector sum time: %f seconds\n", (double)(end - start) / CLOCKS_PER_SEC);

    printf("Now timing the list:\n");
    start = clock();
    SumListElements(container.list);
    end = clock();
    printf("List sum time: %f seconds\n", (double)(end - start) / CLOCKS_PER_SEC);

    printf("Now timing the padded list:\n");
    start = clock();
    SumListElements(container.padded_list);
    end = clock();
    printf("Padded List sum time: %f seconds\n", (double)(end - start) / CLOCKS_PER_SEC);

    DVectorDestroy(container.vec);
    SLLDestroy(container.list);
    SLLDestroy(container.padded_list);
    
    return 0;
}