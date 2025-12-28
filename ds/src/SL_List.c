/******************
 Author : Ayal Moran
 Reviewer: Or Caraco
 Date: 01.04.25
 *****************/
#include <stdlib.h> /*malloc*/
#include <assert.h> /*assert*/

#include "SL_List.h"/*sll_iter_t*/

typedef struct node node_t;

struct node
{
    void* data;
    node_t* next;
};

struct linked_list
{
    node_t* head;
    node_t* tail;
};

static int CountFunc(void* data __attribute__ ((unused)), void* param);
static sll_iter_t NodeToIter(node_t* node);
static node_t* IterToNode(sll_iter_t iter);

static int CountFunc(void* data __attribute__ ((unused)), void* param)
{
    ++(*(int*)param);
    return 0;
}

static sll_iter_t NodeToIter(node_t* node)
{
    return (sll_iter_t)node;
}

static node_t* IterToNode(sll_iter_t iter)
{
    return (node_t*)iter;
}

sll_t* SLLCreate(void)
{
    sll_t* list = NULL;
    node_t* dummy = NULL;
    
    list = (sll_t*)malloc(sizeof(sll_t));
    if (NULL == list)
    {
        return NULL;
    }
    
    dummy = (node_t*)malloc(sizeof(node_t));
    if (NULL == dummy)
    {
        free(list);
        return NULL;
    }
    
    dummy->next = NULL;
    dummy->data = (void*)list;
    
    list->head = dummy;
    list->tail = dummy;
    
    return list;
}

void SLLDestroy(sll_t* list)
{
    node_t* curr = NULL; 
    node_t* next = NULL; 
    
    assert(list);
    
    curr = list->head;
    
    while (NULL != curr)
    {
        next = curr->next;
        free(curr);
        curr = next;
    }
    
    free(list);
}

int SLLIsEmpty(const sll_t* list)
{
    assert(list);
    
    return (list->head == list->tail);
}

int SLLForEach(sll_iter_t from, sll_iter_t to, action_func_t action, void* param)
{
    int result = 0;
    
	assert(from);
	assert(to);
	assert(action);
    
    while (!SLLIterIsEqual(from, to))
    {
        result = action(SLLGetData(from), param); 
        if (result)
        {
            return result;
        }
        from = SLLNext(from); 
    }
    
    return result; 
}

size_t SLLCount(const sll_t* list)
{
	int c = 0;
	
    assert(list);
    
    SLLForEach(SLLBegin(list), SLLEnd(list), CountFunc, &(c)); 
    
    return (size_t)c;
}

sll_iter_t SLLInsert(sll_iter_t where, void* data)
{
    node_t* new_node = NULL;
    sll_t* list = NULL; 
    
    assert(where);
    
    new_node = (node_t*) malloc(sizeof(node_t));
    if (NULL == new_node)
    {
    	sll_iter_t curr  = where;
    	
    	while(IterToNode(curr)->next)
    	{
    		SLLNext(curr);
    	}
    	
        return curr;
    }
    
    new_node->data = SLLGetData(where); 
    new_node->next = IterToNode(SLLNext(where)); 
    
    SLLSetData(where, data);
    IterToNode(where)->next = new_node;
    
    if (NULL == new_node->next)
    {
        list = (sll_t*)(new_node->data);
        list->tail = NodeToIter(new_node);
    }
    
    return where;
}

sll_iter_t SLLRemove(sll_iter_t iter)
{
    node_t* temp = NULL;
    sll_t* list = NULL; 
    
    assert(iter);
    assert(iter->next);
    
    temp = IterToNode(iter)->next; 
    
	SLLSetData(iter, temp->data);
    IterToNode(iter)->next = temp->next;
    
    if (NULL == IterToNode(iter)->next)
    {
        list = (sll_t*)(temp->data);
        list->tail = IterToNode(iter);
    }
    
    free(temp);
    
    return iter;
}

sll_iter_t SLLFind(sll_iter_t from, sll_iter_t to, is_match_t match, void* param)
{
	assert(to);
	assert(from);
	assert(match);
	
    while (!SLLIterIsEqual(from, to))
    {
        if (match(SLLGetData(from), param))
        {
            return from;
        }
        from = SLLNext(from);
    }
    
    return to;
}

sll_iter_t SLLBegin(const sll_t* list)
{
    assert(list);
    
    return NodeToIter(list->head);
}

sll_iter_t SLLEnd(const sll_t* list)
{
    assert(list);
    
    return NodeToIter(list->tail);
}

sll_iter_t SLLNext(sll_iter_t iter)
{
    assert(iter);
    
    return NodeToIter(IterToNode(iter)->next);
}

void* SLLGetData(sll_iter_t iter)
{
    assert(iter);
    
    return IterToNode(iter)->data;
}

void SLLSetData(sll_iter_t iter, void* new_data)
{
    assert(iter);
    
    IterToNode(iter)->data = new_data;
}

int SLLIterIsEqual(sll_iter_t iter1, sll_iter_t iter2)
{
	assert(iter1);
	assert(iter2);
	
    return (IterToNode(iter1) == IterToNode(iter2));
}

void SLLAppend(sll_t* dest, sll_t* src)
{
	node_t* dest_dummy = NULL;
	node_t* src_dummy = NULL;
	
	assert(dest);
	assert(src);
	
	if(SLLIsEmpty(src))
	{	
		return;
	}
		
	src_dummy = src->tail;
	src_dummy->data = dest;
	
	dest_dummy = dest->tail;
    dest_dummy->data = src->head->data;
	dest_dummy->next = src->head->next;

	dest->tail = src_dummy;
	dest->tail->data = dest;
	
	src->head->next = NULL;
	src->head->data = src;
	src->tail = src->head;
}



