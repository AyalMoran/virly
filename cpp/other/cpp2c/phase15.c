#include <stdlib.h>

struct Base;

typedef struct Basevtable
{
    void (*const BaseDtor)(Base*);
    void (*const BaseFoo)(Base*);
}Basevtable;

typedef struct Base {
    Basevtable* vptr;
    int x;
    int y;
}Base;
void BaseDtor(Base* this_ptr){(void)this_ptr;}
void BaseFoo(Base* this_ptr){(void)this_ptr;}
const Basevtable g_base_table = {(void (*const)(Base*))BaseDtor,(void (*const)(Base*))BaseFoo};
Base* BaseCtor(Base* this_ptr, int inX, int inY) 
{
    *(void**)this_ptr = (Basevtable*)&g_base_table;
    this_ptr->x = inX;
    this_ptr->y = inY;
    return this_ptr;
}

struct Derived;
typedef struct DerivedVTable
{
    void (*const DerivedDtor)(Derived*) ;
    void (*const DerivedFoo)(Derived*) ;
}DerivedVTable;

typedef struct Derived {
    Base base_part;
    int z;
}Derived;
void DerivedDtor(){}
const DerivedVTable g_derived_table = {(void (*const)(Derived*))DerivedDtor,(void (*const)(Derived*))BaseFoo};

Derived* DerivedCtor(Derived* this_ptr, int inX, int inY, int inZ)
{
    BaseCtor((Base*)this_ptr,inX, inY);
    *(void**)this_ptr = (DerivedVTable*)&g_derived_table;
    this_ptr->z = inZ;
    return this_ptr;
}

int main()
{
    /*...*/
    Base* pBase = (Base*)DerivedCtor((Derived*)malloc(sizeof(Derived)),5,6,7);
    pBase->vptr->BaseFoo(pBase);
    /*...*/
}
