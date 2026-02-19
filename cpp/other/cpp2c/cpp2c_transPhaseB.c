/********************
 * File: cpp2c_transPhaseB.c
 * Author: Ayal Moran
 * Date: 18-02-2026
 ********************/
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>

static int s_count = 0;

typedef void* VFunc;

enum
{
    VT_DTOR = 0,
    VT_DISPLAY = 1,
    VT_WASH = 2
};

/* ===================== PublicTransport ============================= */

typedef struct PublicTransport PublicTransport;
void PublicTransport_Ctor(PublicTransport* this_ptr);
void PublicTransport_Dtor(PublicTransport* this_ptr);
void PublicTransport_CCtor(PublicTransport* this_ptr,
                           const PublicTransport* other);
void PublicTransport_display(PublicTransport* this_ptr);
void PublicTransport_print_count();
int PublicTransport_get_ID(PublicTransport* this_ptr);

VFunc g_public_transport_table[] = {(VFunc)PublicTransport_Dtor,
                                    (VFunc)PublicTransport_display};

struct PublicTransport
{
    VFunc* vptr;
    int m_license_plate;
};

void PublicTransport_Ctor(PublicTransport* this_ptr)
{
    this_ptr->vptr = g_public_transport_table;
    this_ptr->m_license_plate = ++s_count;
    printf("PublicTransport::Ctor()%d\n", this_ptr->m_license_plate);
}

void PublicTransport_Dtor(PublicTransport* this_ptr)
{
    this_ptr->vptr = g_public_transport_table;
    --s_count;
    printf("PublicTransport::Dtor()%d\n", this_ptr->m_license_plate);
}

void PublicTransport_CCtor(PublicTransport* this_ptr,
                           const PublicTransport* other)
{
    this_ptr->vptr = g_public_transport_table;
    this_ptr->m_license_plate = ++s_count;
    printf("PublicTransport::CCtor() %d\n", this_ptr->m_license_plate);

    (void)other;
}

void PublicTransport_display(PublicTransport* this_ptr)
{
    printf("PublicTransport::display(): %d\n", this_ptr->m_license_plate);
}

void PublicTransport_print_count()
{
    printf("s_count: %d\n", s_count);
}

int PublicTransport_get_ID(PublicTransport* this_ptr)
{
    return this_ptr->m_license_plate;
}

/* ===================== Minibus ============================= */
typedef struct Minibus Minibus;
void Minibus_Ctor(Minibus* this_ptr);
void Minibus_CCtor(Minibus* this_ptr, const Minibus* other);
void Minibus_Dtor(Minibus* this_ptr);
void Minibus_display(Minibus* this_ptr);
void Minibus_wash(Minibus* this_ptr, int minutes);
void Minibus_op_assign(Minibus* this_ptr, const Minibus* other);

VFunc g_MinibusVTable[] = {(VFunc)Minibus_Dtor,
                           (VFunc)Minibus_display,
                           (VFunc)Minibus_wash};

struct Minibus
{
    PublicTransport _base_part;
    int m_numSeats;
};

void Minibus_Ctor(Minibus* this_ptr)
{
    PublicTransport_Ctor((PublicTransport*)this_ptr);
    ((PublicTransport*)this_ptr)->vptr = g_MinibusVTable;
    this_ptr->m_numSeats = 20;
    printf("Minibus::Ctor()\n");
}

void Minibus_CCtor(Minibus* this_ptr, const Minibus* other)
{
    PublicTransport_CCtor((PublicTransport*)this_ptr, (PublicTransport*)other);
    ((PublicTransport*)this_ptr)->vptr = g_MinibusVTable;
    this_ptr->m_numSeats = other->m_numSeats;
    printf("Minibus::CCtor()\n");
}

void Minibus_Dtor(Minibus* this_ptr)
{
    ((PublicTransport*)this_ptr)->vptr = g_MinibusVTable;
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

void Minibus_op_assign(Minibus* this_ptr, const Minibus* other)
{
    this_ptr->m_numSeats = other->m_numSeats;
}

/* =====================ArmyMinibus============================= */
typedef struct ArmyMinibus ArmyMinibus;
void ArmyMinibus_Ctor(ArmyMinibus* this_ptr);
void ArmyMinibus_CCtor(ArmyMinibus* this_ptr, const ArmyMinibus* other);
void ArmyMinibus_Dtor(ArmyMinibus* this_ptr);

VFunc g_ArmyMinibusVTable[] = {(VFunc)ArmyMinibus_Dtor,
                               (VFunc)Minibus_display,
                               (VFunc)Minibus_wash};

struct ArmyMinibus
{
    Minibus _base_part;
};

void ArmyMinibus_Ctor(ArmyMinibus* this_ptr)
{
    Minibus_Ctor((Minibus*)this_ptr);

    ((PublicTransport*)this_ptr)->vptr = g_ArmyMinibusVTable;
    printf("ArmyMinibus::Ctor()\n");
}

void ArmyMinibus_CCtor(ArmyMinibus* this_ptr, const ArmyMinibus* other)
{
    Minibus_CCtor((Minibus*)this_ptr, (Minibus*)other);

    ((PublicTransport*)this_ptr)->vptr = g_ArmyMinibusVTable;

    printf("ArmyMinibus::CCtor()\n");
}

void ArmyMinibus_Dtor(ArmyMinibus* this_ptr)
{
    ((PublicTransport*)this_ptr)->vptr = g_ArmyMinibusVTable;
    printf("ArmyMinibus::Dtor()\n");
    Minibus_Dtor((Minibus*)this_ptr);
}

/* =====================Taxi============================= */

typedef struct Taxi Taxi;
void Taxi_Ctor(Taxi* this_ptr);
void Taxi_CCtor(Taxi* this_ptr, const Taxi* other);
void Taxi_Dtor(Taxi* this_ptr);
void Taxi_display(Taxi* this_ptr);
void Taxi_op_assign(Taxi* this_ptr, const Taxi* other);

VFunc g_TaxiVTable[] = {(VFunc)Taxi_Dtor,
                        (VFunc)Taxi_display};

struct Taxi
{
    PublicTransport _base_part;
};

void Taxi_Ctor(Taxi* this_ptr)
{
    PublicTransport_Ctor((PublicTransport*)this_ptr);

    ((PublicTransport*)this_ptr)->vptr = g_TaxiVTable;

    printf("Taxi::Ctor()\n");
}

void Taxi_CCtor(Taxi* this_ptr, const Taxi* other)
{
    PublicTransport_CCtor((PublicTransport*)this_ptr, (PublicTransport*)other);

    ((PublicTransport*)this_ptr)->vptr = g_TaxiVTable;

    printf("Taxi::CCtor()\n");
}

void Taxi_Dtor(Taxi* this_ptr)
{
    ((PublicTransport*)this_ptr)->vptr = g_TaxiVTable;
    printf("Taxi::Dtor()\n");
    PublicTransport_Dtor((PublicTransport*)this_ptr);
}

void Taxi_display(Taxi* this_ptr)
{
    printf("Taxi::display() ID:%d\n",
           PublicTransport_get_ID((PublicTransport*)this_ptr));
}

void Taxi_op_assign(Taxi* this_ptr, const Taxi* other)
{
    (void)this_ptr;
    (void)other;
}

/* ===================== SpecialTaxi ============================= */

typedef struct SpecialTaxi SpecialTaxi;
void SpecialTaxi_Ctor(SpecialTaxi* this_ptr);
void SpecialTaxi_CCtor(SpecialTaxi* this_ptr, const SpecialTaxi* other);
void SpecialTaxi_Dtor(SpecialTaxi* this_ptr);
void SpecialTaxi_display(SpecialTaxi* this_ptr);

VFunc g_SpecialTaxiVTable[] = {(VFunc)SpecialTaxi_Dtor,
                               (VFunc)SpecialTaxi_display};

struct SpecialTaxi
{
    Taxi _base_part;
};

void SpecialTaxi_Ctor(SpecialTaxi* this_ptr)
{
    Taxi_Ctor((Taxi*)this_ptr);
    ((PublicTransport*)this_ptr)->vptr = g_SpecialTaxiVTable;

    printf("SpecialTaxi::Ctor()\n");
}

void SpecialTaxi_CCtor(SpecialTaxi* this_ptr, const SpecialTaxi* other)
{
    Taxi_CCtor((Taxi*)this_ptr, (Taxi*)other);
    ((PublicTransport*)this_ptr)->vptr = g_SpecialTaxiVTable;

    printf("SpecialTaxi::CCtor()\n");
}

void SpecialTaxi_Dtor(SpecialTaxi* this_ptr)
{
    ((PublicTransport*)this_ptr)->vptr = g_SpecialTaxiVTable;
    printf("SpecialTaxi::Dtor()\n");
    Taxi_Dtor((Taxi*)this_ptr);
}

void SpecialTaxi_display(SpecialTaxi* this_ptr)
{
    printf("SpecialTaxi::display() ID:%d\n",
           PublicTransport_get_ID((PublicTransport*)this_ptr));
}

/* ===================== PublicConvoy ============================= */
typedef struct PublicConvoy PublicConvoy;
void PublicConvoy_Ctor(PublicConvoy* this_ptr);
void PublicConvoy_CCtor(PublicConvoy* this_ptr, const PublicConvoy* other);
void PublicConvoy_Dtor(PublicConvoy* this_ptr);
void PublicConvoy_display(PublicConvoy* this_ptr);
void PublicConvoy_op_assign(PublicConvoy* this_ptr, const PublicConvoy* other);

VFunc g_PublicConvoyVTable[] = {(VFunc)PublicConvoy_Dtor,
                                (VFunc)PublicConvoy_display};

struct PublicConvoy
{
    PublicTransport _base_part;
    PublicTransport* m_pt1;
    PublicTransport* m_pt2;
    Minibus m_m;
    Taxi m_t;
};

void PublicConvoy_Ctor(PublicConvoy* this_ptr)
{
    PublicTransport_Ctor((PublicTransport*)this_ptr);

    this_ptr->m_pt1 = (PublicTransport*)malloc(sizeof(Minibus));
    Minibus_Ctor((Minibus*)this_ptr->m_pt1);

    this_ptr->m_pt2 = (PublicTransport*)malloc(sizeof(Taxi));
    Taxi_Ctor((Taxi*)this_ptr->m_pt2);

    Minibus_Ctor(&this_ptr->m_m);
    Taxi_Ctor(&this_ptr->m_t);

    ((PublicTransport*)this_ptr)->vptr = g_PublicConvoyVTable;
}

void PublicConvoy_CCtor(PublicConvoy* this_ptr, const PublicConvoy* other)
{
    PublicTransport_CCtor((PublicTransport*)this_ptr, (PublicTransport*)other);

    this_ptr->m_pt1 = (PublicTransport*)malloc(sizeof(Minibus));
    Minibus_CCtor((Minibus*)this_ptr->m_pt1, (Minibus*)other->m_pt1);

    this_ptr->m_pt2 = (PublicTransport*)malloc(sizeof(Taxi));
    Taxi_CCtor((Taxi*)this_ptr->m_pt2, (Taxi*)other->m_pt2);

    Minibus_CCtor(&this_ptr->m_m, &other->m_m);
    Taxi_CCtor(&this_ptr->m_t, &other->m_t);

    ((PublicTransport*)this_ptr)->vptr = g_PublicConvoyVTable;
}

void PublicConvoy_Dtor(PublicConvoy* this_ptr)
{
    ((PublicTransport*)this_ptr)->vptr = g_PublicConvoyVTable;

    ((void (*)(PublicTransport*))this_ptr->m_pt1->vptr[VT_DTOR])(this_ptr->m_pt1);
    free(this_ptr->m_pt1);

    ((void (*)(PublicTransport*))this_ptr->m_pt2->vptr[VT_DTOR])(this_ptr->m_pt2);
    free(this_ptr->m_pt2);

    Taxi_Dtor(&this_ptr->m_t);
    Minibus_Dtor(&this_ptr->m_m);
    PublicTransport_Dtor((PublicTransport*)this_ptr);
}

void PublicConvoy_op_assign(PublicConvoy* this_ptr, const PublicConvoy* other)
{
    if (this_ptr != other)
    {
        PublicTransport* new_pt1 = (PublicTransport*)malloc(sizeof(Minibus));
        PublicTransport* new_pt2 = (PublicTransport*)malloc(sizeof(Taxi));

        Minibus_CCtor((Minibus*)new_pt1, (Minibus*)other->m_pt1);
        Taxi_CCtor((Taxi*)new_pt2, (Taxi*)other->m_pt2);

        ((void (*)(PublicTransport*))this_ptr->m_pt1->vptr[VT_DTOR])(this_ptr->m_pt1);
        free(this_ptr->m_pt1);
        ((void (*)(PublicTransport*))this_ptr->m_pt2->vptr[VT_DTOR])(this_ptr->m_pt2);
        free(this_ptr->m_pt2);

        this_ptr->m_pt1 = new_pt1;
        this_ptr->m_pt2 = new_pt2;

        Minibus_op_assign(&this_ptr->m_m, &other->m_m);
        Taxi_op_assign(&this_ptr->m_t, &other->m_t);
    }
}

void PublicConvoy_display(PublicConvoy* this_ptr)
{
    ((void (*)(PublicTransport*))this_ptr->m_pt1->vptr[VT_DISPLAY])(this_ptr->m_pt1);
    ((void (*)(PublicTransport*))this_ptr->m_pt2->vptr[VT_DISPLAY])(this_ptr->m_pt2);
    Minibus_display(&this_ptr->m_m);
    Taxi_display(&this_ptr->m_t);
}

void print_info_PublicTransport(PublicTransport* a)
{
    ((void (*)(PublicTransport*))a->vptr[VT_DISPLAY])(a);
}

void print_info_v()
{
    PublicTransport_print_count();
}

void print_info_Minibus(Minibus* m)
{
    ((void (*)(Minibus*, int))(((PublicTransport*)m)->vptr[VT_WASH]))(m, 3);
}

PublicTransport print_info(int i)
{
    Minibus ret;
    Minibus_Ctor((Minibus*)&ret);
    printf("print_info(int i)\n");
    Minibus_display(&ret);
    (void)i;
    PublicTransport tmp;
    PublicTransport_CCtor(&tmp, ((PublicTransport*)&ret));
    Minibus_Dtor(&ret);
    return (tmp);
}

void taxi_display(Taxi* s)
{
    Taxi taxi_tmp02;
    Taxi_CCtor(&taxi_tmp02, s);
    Taxi_display(&taxi_tmp02);
    Taxi_Dtor(&taxi_tmp02);
}

int max_funcii(const int* t1, const int* t2)
{
    return ((*t1 > *t2) ? *t1 : *t2);
}

int main(int argc, char** argv, char** envp)
{
    Minibus m;
    Minibus_Ctor(&m);

    print_info_Minibus(&m);

    PublicTransport tmp = print_info(3);
    PublicTransport_display(&tmp);
    PublicTransport_Dtor(&tmp);

    Minibus* array_mb1 = (Minibus*)malloc(sizeof(Minibus));
    Taxi* array_tx1 = (Taxi*)malloc(sizeof(Taxi));
    Minibus* array_mb2 = (Minibus*)malloc(sizeof(Minibus));
    Minibus_Ctor(array_mb1);
    Taxi_Ctor(array_tx1);
    Minibus_Ctor(array_mb2);
    PublicTransport* array[] = {(PublicTransport*)array_mb1,
                                (PublicTransport*)array_tx1,
                                (PublicTransport*)array_mb2};

    ((void (*)(PublicTransport*))array[0]->vptr[VT_DISPLAY])(array[0]);
    ((void (*)(PublicTransport*))array[1]->vptr[VT_DISPLAY])(array[1]);
    ((void (*)(PublicTransport*))array[2]->vptr[VT_DISPLAY])(array[2]);

    ((void (*)(PublicTransport*))array[0]->vptr[VT_DTOR])(array[0]);
    free(array[0]);
    ((void (*)(PublicTransport*))array[1]->vptr[VT_DTOR])(array[1]);
    free(array[1]);
    ((void (*)(PublicTransport*))array[2]->vptr[VT_DTOR])(array[2]);
    free(array[2]);

    PublicTransport arr2[3] = {};
    Minibus minibus_tmp;
    Minibus_Ctor(&minibus_tmp);
    PublicTransport_CCtor(&arr2[0], (PublicTransport*)&minibus_tmp);
    Taxi taxi_tmp01;
    Taxi_Ctor(&taxi_tmp01);
    PublicTransport_CCtor(&arr2[1], (PublicTransport*)&taxi_tmp01);
    PublicTransport_Ctor(&arr2[2]);

    Taxi_Dtor(&taxi_tmp01);
    Minibus_Dtor(&minibus_tmp);

    PublicTransport_display(&arr2[0]);
    PublicTransport_display(&arr2[1]);
    PublicTransport_display(&arr2[2]);

    print_info_PublicTransport((PublicTransport*)&arr2[0]);

    PublicTransport_print_count();

    Minibus m2;
    Minibus_Ctor(&m2);
    PublicTransport_print_count();

    Minibus arr3[4] = {};
    Minibus_Ctor(&arr3[0]);
    Minibus_Ctor(&arr3[1]);
    Minibus_Ctor(&arr3[2]);
    Minibus_Ctor(&arr3[3]);

    Taxi* arr4 = (Taxi*)malloc(4 * sizeof(Taxi));
    for (size_t i = 0; i < 4; ++i)
    {
        Taxi_Ctor(arr4 + i);
    }

    for (size_t i = 4; i > 0; --i)
    {
        Taxi_Dtor(arr4 + i - 1);
    }
    free(arr4);

    int a = 1;
    int b = 2;
    int bf = (int)2.0f;

    printf("%d\n", (max_funcii(&a, &b)));
    printf("%d\n", (max_funcii(&a, &bf)));

    SpecialTaxi st;
    SpecialTaxi_Ctor(&st);

    taxi_display((Taxi*)&st);

    PublicConvoy* ts1 = (PublicConvoy*)malloc(sizeof(PublicConvoy));
    PublicConvoy* ts2 = (PublicConvoy*)malloc(sizeof(PublicConvoy));
    PublicConvoy_Ctor(ts1);
    PublicConvoy_CCtor(ts2, ts1);
    PublicConvoy_display(ts1);
    PublicConvoy_display(ts2);
    PublicConvoy_Dtor(ts1);
    free(ts1);
    PublicConvoy_display(ts2);
    PublicConvoy_Dtor(ts2);
    free(ts2);

    ArmyMinibus* army_minibus = (ArmyMinibus*)malloc(sizeof(ArmyMinibus));
    ArmyMinibus_Ctor(army_minibus);

    ((void (*)(PublicTransport*))((PublicTransport*)army_minibus)->vptr[VT_DISPLAY])((PublicTransport*)army_minibus);

    ((void (*)(Minibus*, int))((PublicTransport*)army_minibus)->vptr[VT_WASH])((Minibus*)army_minibus, 5);
    ArmyMinibus_Dtor(army_minibus);
    free(army_minibus);

    SpecialTaxi_Dtor(&st);
    Minibus_Dtor(&arr3[3]);
    Minibus_Dtor(&arr3[2]);
    Minibus_Dtor(&arr3[1]);
    Minibus_Dtor(&arr3[0]);
    Minibus_Dtor(&m2);
    PublicTransport_Dtor(&arr2[2]);
    PublicTransport_Dtor(&arr2[1]);
    PublicTransport_Dtor(&arr2[0]);
    Minibus_Dtor(&m);

    (void)argc;
    (void)argv;
    (void)envp;

    return 0;
}
