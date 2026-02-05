
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>

static int s_count = 0;

/* ===================== PublicTransport ============================= */

typedef struct PublicTransport PublicTransport;
PublicTransport* PublicTransport_Ctor(PublicTransport* this_ptr);
void PublicTransport_Dtor(PublicTransport* this_ptr);
PublicTransport* PublicTransport_CCtor(PublicTransport* this_ptr,
                                       const PublicTransport* other);
void PublicTransport_display(PublicTransport* this_ptr);
void PublicTransport_print_count();
int PublicTransport_get_ID(PublicTransport* this_ptr);

typedef struct PublicTransportVTable
{
    void (*PublicTransport_Dtor)(PublicTransport*);
    void (*PublicTransport_display)(PublicTransport*);

} PublicTransportVTable;

PublicTransportVTable g_public_transport_table = {PublicTransport_Dtor,
                                                  PublicTransport_display};
typedef struct PublicTransport
{
    PublicTransportVTable* vptr;
    int m_license_plate;
    /*PublicTransport* operator=(const PublicTransport*); */
} PublicTransport;

PublicTransport* PublicTransport_Ctor(PublicTransport* this_ptr)
{
    this_ptr->vptr = &g_public_transport_table;
    this_ptr->m_license_plate = ++s_count;
    printf("PublicTransport::Ctor()%d\n", this_ptr->m_license_plate);

    return this_ptr;
}
void PublicTransport_Dtor(PublicTransport* this_ptr)
{
    --s_count;
    printf("PublicTransport::Dtor()%d\n", this_ptr->m_license_plate);
}

PublicTransport* PublicTransport_CCtor(PublicTransport* this_ptr,
                                       const PublicTransport* other)
{
    *(PublicTransportVTable*)this_ptr =
        *(PublicTransportVTable*)&g_public_transport_table;
    this_ptr->m_license_plate = ++s_count;
    printf("PublicTransport::CCtor() %d\n", this_ptr->m_license_plate);

    (void)other;
    return this_ptr;
}

void PublicTransport_display(PublicTransport* this_ptr)
{
    printf("PublicTransport::display()%d\n", this_ptr->m_license_plate);
}

void PublicTransport_print_count()
{
    printf("s_count:%d\n", s_count);
}

int PublicTransport_get_ID(PublicTransport* this_ptr)
{
    return this_ptr->m_license_plate;
}

/* ===================== Minibus ============================= */
typedef struct Minibus Minibus;
Minibus* Minibus_Ctor(Minibus* this_ptr);
Minibus* Minibus_CCtor(Minibus* this_ptr, const Minibus* other);
void Minibus_Dtor(Minibus* this_ptr);
void Minibus_display(Minibus* this_ptr);
void Minibus_wash(Minibus* this_ptr, int minutes);

typedef struct MinibusVTable
{
    void (*Minibus_Dtor)(Minibus*);
    void (*Minibus_display)(Minibus*);
    void (*Minibus_wash)(Minibus*, int);

} MinibusVTable;

MinibusVTable g_MinibusVTable = {Minibus_Dtor, Minibus_display, Minibus_wash};
typedef struct Minibus
{
    PublicTransport _base_part;

    int m_numSeats;
} Minibus;

Minibus* Minibus_Ctor(Minibus* this_ptr)
{
    *(PublicTransport*)this_ptr =
        *PublicTransport_Ctor((PublicTransport*)this_ptr);
    ((PublicTransport*)this_ptr)->vptr =
        (PublicTransportVTable*)&g_MinibusVTable;
    this_ptr->m_numSeats = 20;
    printf("Minibus::Ctor()\n");
    return this_ptr;
}

Minibus* Minibus_CCtor(Minibus* this_ptr, const Minibus* other)
{
    *(PublicTransport*)this_ptr = *PublicTransport_CCtor(
        (PublicTransport*)this_ptr, (PublicTransport*)other);
    ((PublicTransport*)this_ptr)->vptr =
        (PublicTransportVTable*)&g_MinibusVTable;
    this_ptr->m_numSeats = other->m_numSeats;
    printf("Minibus::CCtor()\n");

    return this_ptr;
}

void Minibus_Dtor(Minibus* this_ptr)
{
    (void)this_ptr;
    printf("Minibus::Dtor()\n");
    PublicTransport_Dtor((PublicTransport*)this_ptr);
}

void Minibus_display(Minibus* this_ptr)
{
    printf("Minibus::display() ID:%d",
           PublicTransport_get_ID((PublicTransport*)this_ptr));
    printf(" num seats:%d\n", this_ptr->m_numSeats);
}

void Minibus_wash(Minibus* this_ptr, int minutes)
{
    printf("Minibus::wash(%d) ID:%d\n", minutes,
           PublicTransport_get_ID((PublicTransport*)this_ptr));
}

/* =====================ArmyMinibus============================= */
typedef struct ArmyMinibus ArmyMinibus;
ArmyMinibus* ArmyMinibus_Ctor(ArmyMinibus* this_ptr);
ArmyMinibus* ArmyMinibus_CCtor(ArmyMinibus* this_ptr, const ArmyMinibus* other);
void ArmyMinibus_Dtor(ArmyMinibus* this_ptr);

typedef struct ArmyMinibusVTable
{
    void (*ArmyMinibus_Dtor)(ArmyMinibus*);
    void (*Minibus_display)(Minibus*);
    void (*Minibus_wash)(Minibus*, int);
} ArmyMinibusVTable;
ArmyMinibusVTable g_ArmyMinibusVTable = {ArmyMinibus_Dtor, Minibus_display,
                                         Minibus_wash};

typedef struct ArmyMinibus
{
    Minibus _base_part;
} ArmyMinibus;

ArmyMinibus* ArmyMinibus_Ctor(ArmyMinibus* this_ptr)
{

    *(Minibus*)this_ptr = *Minibus_Ctor((Minibus*)this_ptr);

    ((PublicTransport*)this_ptr)->vptr =
        (PublicTransportVTable*)&g_ArmyMinibusVTable;
    printf("ArmyMinibus::Ctor()\n");
    return this_ptr;
}

ArmyMinibus* ArmyMinibus_CCtor(ArmyMinibus* this_ptr, const ArmyMinibus* other)
{
    *(Minibus*)this_ptr = *Minibus_CCtor((Minibus*)this_ptr, (Minibus*)other);

    ((PublicTransport*)this_ptr)->vptr =
        (PublicTransportVTable*)&g_ArmyMinibusVTable;

    printf("ArmyMinibus::CCtor()\n");

    return this_ptr;
}

void ArmyMinibus_Dtor(ArmyMinibus* this_ptr)
{
    (void)this_ptr;
    Minibus_Dtor((Minibus*)this_ptr);
    printf("ArmyMinibus::Dtor()\n");
}

/* =====================Taxi============================= */

typedef struct Taxi Taxi;
Taxi* Taxi_Ctor(Taxi* this_ptr);
Taxi* Taxi_CCtor(Taxi* this_ptr, const Taxi* other);
void Taxi_Dtor(Taxi* this_ptr);
void Taxi_display(Taxi* this_ptr);
void Taxi_wash(Taxi* this_ptr, int minutes);

typedef struct TaxiVTable
{
    void (*Taxi_Dtor)(Taxi*);
    void (*Taxi_display)(Taxi*);

} TaxiVTable;
TaxiVTable g_TaxiVTable = {Taxi_Dtor, Taxi_display};

typedef struct Taxi
{
    PublicTransport _base_part;
} Taxi;

Taxi* Taxi_Ctor(Taxi* this_ptr)
{
    *(PublicTransport*)this_ptr =
        *PublicTransport_Ctor((PublicTransport*)this_ptr);
    printf("Taxi::Ctor()\n");

    ((PublicTransport*)this_ptr)->vptr = (PublicTransportVTable*)&g_TaxiVTable;

    return this_ptr;
}

Taxi* Taxi_CCtor(Taxi* this_ptr, const Taxi* other)
{
    *(PublicTransport*)this_ptr = *PublicTransport_CCtor(
        (PublicTransport*)this_ptr, (PublicTransport*)other);

    ((PublicTransport*)this_ptr)->vptr = (PublicTransportVTable*)&g_TaxiVTable;

    printf("Taxi::CCtor()\n");

    return this_ptr;
}

void Taxi_Dtor(Taxi* this_ptr)
{
    (void)this_ptr;
    PublicTransport_Dtor((PublicTransport*)this_ptr);
    printf("Minibus::Dtor()\n");
}

void Taxi_display(Taxi* this_ptr)
{
    printf("Taxi::display() ID:%d\n",
           PublicTransport_get_ID((PublicTransport*)this_ptr));
}

void Taxi_wash(Taxi* this_ptr, int minutes)
{
    printf("Taxi::wash(%d) ID:%d\n", minutes,
           PublicTransport_get_ID((PublicTransport*)this_ptr));
}

/* ===================== max_func Template ============================= */

#define max_funcTEMPLATE(T)                                                    \
    T max_func_##T(const T* t1, const T* t2)                                   \
    {                                                                          \
        return ((*t1 > *t2) ? *t1 : *t2);                                      \
    }

/* ===================== SpecialTaxi ============================= */

typedef struct SpecialTaxi SpecialTaxi;
SpecialTaxi* SpecialTaxi_Ctor(SpecialTaxi* this_ptr);
SpecialTaxi* SpecialTaxi_CCtor(SpecialTaxi* this_ptr, const SpecialTaxi* other);
void SpecialTaxi_Dtor(SpecialTaxi* this_ptr);
void SpecialTaxi_display(SpecialTaxi* this_ptr);

typedef struct SpecialTaxiVTable
{
    void (*SpecialTaxi_Dtor)(SpecialTaxi*);
    void (*SpecialTaxi_display)(SpecialTaxi*);

} SpecialTaxiVTable;
SpecialTaxiVTable g_SpecialTaxiVTable = {SpecialTaxi_Dtor, SpecialTaxi_display};

typedef struct SpecialTaxi
{
    Taxi _base_part;
} SpecialTaxi;

SpecialTaxi* SpecialTaxi_Ctor(SpecialTaxi* this_ptr)
{
    *(Taxi*)this_ptr = *Taxi_Ctor((Taxi*)this_ptr);
    ((PublicTransport*)this_ptr)->vptr =
        (PublicTransportVTable*)&g_SpecialTaxiVTable;

    printf("SpecialTaxi::Ctor()\n");
    return this_ptr;
}

SpecialTaxi* SpecialTaxi_CCtor(SpecialTaxi* this_ptr, const SpecialTaxi* other)
{
    *(Taxi*)this_ptr = *Taxi_CCtor((Taxi*)this_ptr, (Taxi*)other);
    ((PublicTransport*)this_ptr)->vptr =
        (PublicTransportVTable*)&g_SpecialTaxiVTable;

    printf("SpecialTaxi::CCtor()\n");

    return this_ptr;
}

void SpecialTaxi_Dtor(SpecialTaxi* this_ptr)
{
    (void)this_ptr;
    Taxi_Dtor((Taxi*)this_ptr);
    printf("SpecialTaxi::Dtor()\n");
}

void SpecialTaxi_display(SpecialTaxi* this_ptr)
{
    printf("SpecialTaxi::display() ID:%d\n",
           PublicTransport_get_ID((PublicTransport*)this_ptr));
}

void print_info_PublicTransport(PublicTransport* a)
{
    a->vptr->PublicTransport_display(a);
}

void print_info_v()
{
    PublicTransport_print_count();
}

void print_info_Minibus(Minibus* m)
{
    ((MinibusVTable*)((PublicTransport*)m)->vptr)->Minibus_wash(m, 3);
}

PublicTransport print_info(int i)
{
    Minibus ret = *Minibus_Ctor((Minibus*)&ret);
    printf("print_info(int i)\n");
    Minibus_display(&ret);
    (void)i;
    PublicTransport tmp = *PublicTransport_CCtor(&tmp,((PublicTransport*)&ret));
    Minibus_Dtor(&ret);
    return (tmp);
}

void taxi_display(Taxi s)
{
    Taxi_display(&s);
}

int main(int argc, char** argv, char** envp)
{
    Minibus m = *Minibus_Ctor(&m);

    print_info_Minibus(&m);

    PublicTransport tmp = print_info(3);
    PublicTransport_display(&tmp);
    PublicTransport_Dtor(&tmp);

    printf("%d\n", __LINE__);

    PublicTransport* array[] = {
        (PublicTransport*)Minibus_Ctor((Minibus*)malloc(sizeof(Minibus))),
        (PublicTransport*)Taxi_Ctor((Taxi*)malloc(sizeof(Taxi))),
        (PublicTransport*)Minibus_Ctor((Minibus*)malloc(sizeof(Minibus)))};
    printf("%d\n", __LINE__);

    printf("%d\n", __LINE__);
    array[0]->vptr->PublicTransport_display(array[0]);

    printf("%d\n", __LINE__);
    array[1]->vptr->PublicTransport_display(array[1]);

    printf("%d\n", __LINE__);
    array[2]->vptr->PublicTransport_display(array[2]);

    printf("%d\n", __LINE__);
    array[0]->vptr->PublicTransport_Dtor(array[0]);
    printf("%d\n", __LINE__);
    free(array[0]);
    printf("%d\n", __LINE__);
    array[1]->vptr->PublicTransport_Dtor(array[1]);
    printf("%d\n", __LINE__);
    free(array[1]);
    printf("%d\n", __LINE__);
    array[2]->vptr->PublicTransport_Dtor(array[2]);
    printf("%d\n", __LINE__);
    free(array[2]);
    printf("%d\n", __LINE__);

    PublicTransport arr2[] = {
        *(PublicTransport*)Minibus_Ctor((Minibus*)malloc(sizeof(Minibus))),
        *(PublicTransport*)Taxi_Ctor((Taxi*)malloc(sizeof(Taxi))),
        *(PublicTransport*)PublicTransport_Ctor(
            (PublicTransport*)malloc(sizeof(PublicTransport)))};
    printf("%d\n", __LINE__);

    printf("%d\n", __LINE__);
    PublicTransport_display(&arr2[0]);

    printf("%d\n", __LINE__);
    PublicTransport_display(&arr2[1]);

    printf("%d\n", __LINE__);
    PublicTransport_display(&arr2[2]);

    printf("%d\n", __LINE__);
    print_info_PublicTransport(&arr2[0]);

    printf("%d\n", __LINE__);
    PublicTransport_print_count();

    Minibus m2 = *(Minibus*)Minibus_Ctor(&m2);
    PublicTransport_print_count();
    printf("%d\n", __LINE__);

    Minibus arr3[4] = {*Minibus_Ctor((Minibus*)malloc(sizeof(Minibus))),
                       *Minibus_Ctor((Minibus*)malloc(sizeof(Minibus))),
                       *Minibus_Ctor((Minibus*)malloc(sizeof(Minibus))),
                       *Minibus_Ctor((Minibus*)malloc(sizeof(Minibus)))};
    printf("%d\n", __LINE__);

    Taxi* arr4 = (Taxi*)malloc(4 * sizeof(Taxi));
    for (size_t i = 0; i < 4; ++i)
    {
        arr4[i] = *Taxi_Ctor(arr4 + i);
    }
    printf("%d", __LINE__);

    for (size_t i = 4; i > 0; --i)
    {
        Taxi_Dtor(arr4 + i - 1);
    }
    free(arr4);
    printf("%d", __LINE__);

    max_funcTEMPLATE(int) int a = 1;
    int b = 2;
    int bf = (int)2.0f;
    fflush(stdout);
    printf("%d", __LINE__);

    printf("%d\n", max_func_int((int*)&a, (int*)&b));
    printf("%d\n", __LINE__);

    printf("%d\n", max_func_int((int*)&a, (int*)&bf));
    printf("%d\n", __LINE__);

    SpecialTaxi st = *SpecialTaxi_Ctor(&st);
    printf("%d\n", __LINE__);

    taxi_display(*(Taxi*)&st);
    printf("%d\n", __LINE__);

    ArmyMinibus* army_minibus = (ArmyMinibus*)ArmyMinibus_Ctor(
        (ArmyMinibus*)malloc(sizeof(ArmyMinibus)));

    ((MinibusVTable*)((PublicTransport*)army_minibus)->vptr)
        ->Minibus_display((Minibus*)army_minibus);
    printf("%d\n", __LINE__);

    ((MinibusVTable*)((PublicTransport*)army_minibus)->vptr)
        ->Minibus_wash((Minibus*)army_minibus, 5);
    printf("%d\n", __LINE__);

    ArmyMinibus_Dtor(army_minibus);
    printf("%d\n", __LINE__);

    free(army_minibus);

    return 0;
}
