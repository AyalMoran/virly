/******************
 Author : Ayal Moran
 Reviewer:Or Caraco
 Date: 08.04.24 
 *****************/
#include <sys/types.h>  /* ssize_t  */
#include <assert.h>     /* assert   */
#include <stdlib.h>     /* malloc   */
#include <string.h>     /* memmove  */
#include <stddef.h>     /* offsetof */

#include "cbuff.h"      /* c_buffer_t */

#define MIN(a,b) ( (a) < (b) ? (a) : (b) ) /* find the minimium between a and b */

struct c_buffer
{
    size_t capacity;
    size_t read_i;    
    size_t size;      
    char data[1];
};

static size_t WriteToBuffer(c_buffer_t* c_buffer, const void* src, size_t index, size_t data_size);
static size_t ReadFromBuffer( c_buffer_t* c_buffer, void* dest, size_t index, size_t data_size);
static size_t GetWriteIndex(const c_buffer_t* cb);
static size_t GetReadIndex(const c_buffer_t* cb);

c_buffer_t* CBuffCreate(size_t capacity)
{

    c_buffer_t* cb = (c_buffer_t*) malloc(offsetof(c_buffer_t, data) + capacity * sizeof(char));
    if (NULL == cb)
    {
        return NULL;
    }
    
    cb->read_i = 0;
    cb->size   = 0;
    cb->capacity = capacity;
    
    return cb;
}

void CBuffDestroy(c_buffer_t* c_buffer)
{
    assert(c_buffer);
    
    free(c_buffer);
}

ssize_t CBuffWrite(c_buffer_t* c_buffer, const void* src, size_t data_size)
{
    size_t free_space = 0;
    
    assert(c_buffer);
    assert(src);
    
    if(0 == data_size)
    {
        return 0;
    }
    
    free_space = CBuffFreeSpace(c_buffer);
    
    if(!free_space)
    {
        return -1; 
    }
    
    data_size = MIN(data_size, free_space);
    
    return WriteToBuffer(c_buffer, src, GetWriteIndex(c_buffer), data_size);
} 

ssize_t CBuffRead(c_buffer_t* c_buffer, void* dest, size_t data_size)
{
    size_t occupied = 0;
    
    assert(c_buffer);
    assert(dest);
    
    if(0 == data_size)
    {
        return 0;
    }
    
    if(CBuffIsEmpty(c_buffer))
    {
        return -1;
    }
    
    occupied = CBuffSize(c_buffer);
    data_size = MIN(data_size, occupied);
    
    return ReadFromBuffer(c_buffer, dest, GetReadIndex(c_buffer), data_size);
}

size_t CBuffFreeSpace(const c_buffer_t* c_buffer)
{
    assert(c_buffer);
    
    return (c_buffer->capacity - CBuffSize(c_buffer));
}

size_t CBuffSize(const c_buffer_t* c_buffer)
{
    assert(c_buffer);

    return c_buffer->size;
}

int CBuffIsEmpty(const c_buffer_t* c_buffer)
{
    assert(c_buffer);

    return (0 == CBuffSize(c_buffer));
}

/*Static Functions*/
static size_t WriteToBuffer(c_buffer_t* c_buffer, const void* src, size_t index, size_t data_size)
{
    size_t first_part = 0;
    size_t second_part = 0;

    assert(c_buffer);
    assert(src);

    first_part = MIN(data_size, (c_buffer->capacity - index));
    second_part = data_size - first_part;
        
    memmove(c_buffer->data+index, src, first_part);
    memmove(c_buffer->data, (const char*)src + first_part, second_part);

    c_buffer->size += data_size;
    
    return data_size;
}

static size_t ReadFromBuffer( c_buffer_t* c_buffer, void* dest, size_t index, size_t data_size)
{
    size_t first_part = 0;
    size_t second_part = 0;

    assert(c_buffer);
    assert(dest);

    first_part = MIN(data_size, (c_buffer->capacity - index));
    second_part = data_size - first_part;
    
    memmove(dest, c_buffer->data+index, first_part);
    memmove((char*)dest + first_part, c_buffer->data, second_part);
 
    c_buffer->read_i = (c_buffer->read_i + data_size) % c_buffer->capacity;
    c_buffer->size -= data_size;
     
    return data_size;
}

static size_t GetWriteIndex(const c_buffer_t* cb)
{
    assert(cb);
    
    return (cb->read_i + cb->size) % cb->capacity;
}

static size_t GetReadIndex(const c_buffer_t* cb)
{
    assert(cb);
    
    return cb->read_i;
}

