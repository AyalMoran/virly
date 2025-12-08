/******************
 Author : Ayal Moran
 Reviewer: Susie Altalef-Cohen
 Date: 08.04.25
 *****************/
#include <assert.h> /* assert */
#include <stdlib.h> /* malloc */

#include "DLL.h" /* dllist_t */

typedef struct node node_t;

struct node
{
    void* data;
    node_t* next;
    node_t* prev;
};

struct dllist
{
    node_t head_dummy;
    node_t tail_dummy;
};

static int CountFunc(void* data, void* param);
static void EmptyList(dllist_t* list);
static dll_iter_t NodeToIter(const node_t* node);
static node_t* IterToNode(const dll_iter_t iter);
static void DLLSetNext(dll_iter_t iter, node_t* next);
static void DLLSetPrev(dll_iter_t iter, node_t* prev);
static node_t* DLLSetNode(node_t * node, node_t* prev, node_t* next, const void* data);
static dll_iter_t GetEnd(dll_iter_t iter);

dllist_t* DLLCreate(void)
{
    dllist_t* list = (dllist_t*) malloc(sizeof(dllist_t));
    if (NULL == list)
    {
        return NULL;
    }
    
    DLLSetNode(&list->head_dummy, NULL, &list->tail_dummy, &list);
    DLLSetNode(&list->tail_dummy, &list->head_dummy, NULL, &list);
    
    return list;
}

void DLLDestroy(dllist_t* list)
{
    EmptyList(list);
    free(list);
}

dll_iter_t DLLBegin(const dllist_t* list)
{
    assert(list);
    
    return NodeToIter(list->head_dummy.next);
}

dll_iter_t DLLEnd(const dllist_t* list)
{   
    assert(list);
    
    return NodeToIter(&list->tail_dummy);
}

dll_iter_t DLLNext(const dll_iter_t curr)
{
    assert(curr);
    assert(curr->next);

    return NodeToIter(IterToNode(curr)->next);
}

dll_iter_t DLLPrev(dll_iter_t curr)
{
    assert(curr);
    assert(curr->prev);
    
    return NodeToIter(IterToNode(curr)->prev);
}

int DLLIterIsEqual(dll_iter_t iter1, dll_iter_t iter2)
{
	assert(iter1);
	assert(iter2);
	
    return (IterToNode(iter1) == IterToNode(iter2));
}

void* DLLGetData(dll_iter_t iter)
{   
    assert(iter);
    
    return IterToNode(iter)->data;
}

void DLLSetData(dll_iter_t iter, void* data)
{
    assert(iter);
    
    IterToNode(iter)->data = data;
}

dll_iter_t DLLInsert(dll_iter_t where, const void* data) 
{
    node_t* new_node = NULL;
    
    assert(where);
    
    new_node = (node_t*) malloc(sizeof(node_t));
    if (NULL == new_node)
    {
        return GetEnd(where);
    }
    
    DLLSetNode(new_node, IterToNode(where)->prev, IterToNode(where), data);
    
    DLLSetNext(DLLPrev(where), new_node);
    DLLSetPrev(where, new_node);
    
    return new_node;
}

dll_iter_t DLLRemove(dll_iter_t iter) 
{
    node_t* node_to_remove = IterToNode(iter);
    dll_iter_t next = NodeToIter(node_to_remove->next);
    
    assert(iter);
    assert(iter->next);
    
    DLLSetPrev(NodeToIter(node_to_remove->next), node_to_remove->prev);
    DLLSetNext(NodeToIter(node_to_remove->prev), node_to_remove->next);
    
    node_to_remove->data = NULL;
    
    free(node_to_remove);
    
    return next;
}

dll_iter_t DLLPushFront(dllist_t* list, const void* data)
{
    assert(list);
    
    return DLLInsert(DLLBegin(list), data);
}

dll_iter_t DLLPushBack(dllist_t* list, const void* data)
{
    assert(list);
    
    return DLLInsert(DLLEnd(list), data);
}

void* DLLPopFront(dllist_t* list)
{
    void* data = NULL;
    
    assert(list);
    
    data = DLLGetData(DLLBegin(list));
    DLLRemove(DLLBegin(list));
    
    return data;
}

void* DLLPopBack(dllist_t* list)
{
    void* data = NULL;
    
    assert(list);
    
    data = DLLGetData(DLLPrev(DLLEnd(list)));
    DLLRemove(DLLPrev(DLLEnd(list)));
    
    return data;
}

int DLLIsEmpty(const dllist_t* list)
{
    assert(list);
    
    return (DLLIterIsEqual(DLLBegin(list), DLLEnd(list)));
}

size_t DLLCount(const dllist_t* list)
{
    size_t amount_of_nodes = 0;
    
    assert(list);
    
    DLLForEach(DLLBegin(list), DLLEnd(list), CountFunc, &amount_of_nodes);
    
    return amount_of_nodes;
}

int DLLForEach(dll_iter_t from, dll_iter_t to, int (*action)(void* data, void* param), void* param)
{
    int status = 0;
    
    assert(from);
    assert(to);
    assert(action);
    
    while (!DLLIterIsEqual(from, to) && !status)
    {
        status = action(DLLGetData(from), param); 
        from = DLLNext(from); 
    }
    
    return status; 
}

dll_iter_t DLLFind(dll_iter_t from, dll_iter_t to, int (*is_match)(const void* data, void* param), void* param)
{
    assert(to);
    assert(from);
    assert(is_match);
    
    while (!DLLIterIsEqual(from, to) && !is_match(DLLGetData(from), param))
    {
        from = DLLNext(from);
    }
    
    return from;
}

int DLLMultiFind(dll_iter_t from, dll_iter_t to, int (*is_match)(const void* data, void* param), void* param, dllist_t* dest)
{
    dll_iter_t found_iter = NULL;
    
    assert(to);
    assert(from);
    assert(is_match);
    
    found_iter = from;
    
    while (!DLLIterIsEqual(found_iter, to))
    {
        found_iter = DLLFind(found_iter, to, is_match, param);
        
        if (DLLIterIsEqual(found_iter, to))
        {
            return 0;
        }
        
        if (DLLIterIsEqual(DLLEnd(dest), DLLPushBack(dest, DLLGetData(found_iter))))
        {
            EmptyList(dest);
            return 1;
        }
        
        found_iter = DLLNext(found_iter);
    }
    
    return 0;    
}

void DLLSplice(dll_iter_t where, dll_iter_t from, dll_iter_t to)
{
    dll_iter_t last = NULL;
    
    assert(to);
    assert(from);
    assert(where);
    
    last = DLLPrev(to);
    
    DLLSetNext(DLLPrev(from), to);
    DLLSetPrev(to, DLLPrev(from));
    
    DLLSetNext(DLLPrev(where), from);
    DLLSetPrev(from, DLLPrev(where));
    
    DLLSetNext(last, where);
    DLLSetPrev(where, last);
}

/* Static Functions */

static int CountFunc(void* data, void* param)
{
    assert(param);
    
    (void)data;
    ++(*(size_t*)param);
    
    return 0;
}

static void EmptyList(dllist_t* list)
{
    assert(list);
    
    while (!DLLIsEmpty(list))
    {
        DLLRemove(DLLBegin(list));
    }
}

static dll_iter_t NodeToIter(const node_t* node)
{
    assert(node);
    
    return (dll_iter_t)node;
}

static node_t* IterToNode(const dll_iter_t iter)
{
    assert(iter);
    
    return (node_t*)iter;
}

static void DLLSetNext(dll_iter_t iter, node_t* next)
{
	assert(iter);
	
    IterToNode(iter)->next = next;
}

static void DLLSetPrev(dll_iter_t iter, node_t* prev)
{
	assert(iter);
	                                                                        
    IterToNode(iter)->prev = prev;
}

static node_t* DLLSetNode(node_t * node, node_t* prev, node_t* next, const void* data)
{
    assert(node);
    
    DLLSetNext((dll_iter_t)node, next);
    DLLSetPrev((dll_iter_t)node, prev);
    node->data = (void*)data;
    
    return node;
}

static dll_iter_t GetEnd(dll_iter_t iter)
{
    assert(iter);
    
    while (NULL != IterToNode(DLLNext(iter)))
    {
        iter = DLLNext(iter);
    }
    
    return iter;
}

