/**************************************************************
 * File    : BstToListBFS.c
 * Author  : Ayal Moran
 * Reviewer: 
 * Date    : 
**************************************************************/

/*============================ INCLUDES ============================*/
#include <stddef.h>
#include "queue.h"

#include "BstToListBFS.h"

/*========================== DEFINITIONS ===========================*/

static int QueueIsEmpty(queue_ty* queue){
    return !QueueSize(queue);
}

void BstToListBFS(const bst_node_ty* root, int array[], size_t size)
{
    size_t i = 0;
	queue_ty* queue = QueueCreate();
    QueueEnqueue(queue,root);
   	while(!QueueIsEmpty(queue))
    {
        bst_node_ty* tmp = (bst_node_ty*)QueueFront(queue);
        array[i] = tmp->data;
        ++i;
        if(tmp->left)
        {        
        	QueueEnqueue(queue,tmp->left);
        }
        if(tmp->right)
        {        
        	QueueEnqueue(queue,tmp->right);
        }
        QueueDequeue(queue);
    }
}
