#include <iostream> //cout
#include <stdio.h>

static int s_count = 0;
struct PublicTransport;

typedef struct PublicTransportVTable
{
    void (*PublicTransportDtor)(PublicTransport*);
    void (*PublicTransport_display)(PublicTransport*);

} PublicTransportVTable;

typedef struct PublicTransport
{
    PublicTransportVTable* vptr;
    int m_license_plate;
    PublicTransport& operator = (const PublicTransport&); // disabled
} PublicTransport;

PublicTransport* PublicTransportCtor(PublicTransport* this_ptr)
{
    this_ptr->m_license_plate = ++s_count;
    printf("PublicTransport::Ctor()%d\n", this_ptr->m_license_plate);

    return this_ptr;
}
void PublicTransportDtor(PublicTransport* this_ptr)
{
    --s_count;
    printf("PublicTransport::Dtor()%d\n", this_ptr->m_license_plate);
}

PublicTransport* PublicTransportCCtor(PublicTransport* this_ptr,
                                     const PublicTransport* other)
{
    this_ptr->m_license_plate = ++s_count;
    printf("PublicTransport::CCtor()%d\n", this_ptr->m_license_plate);

    return this_ptr;
}

void PublicTransport_display(PublicTransport* this_ptr)
{
    printf("PublicTransport::display()%d\n", this_ptr->m_license_plate);
}

static void PublicTransport_print_count()
{
    printf("s_count:%d\n", s_count);
}

int get_ID(PublicTransport* this_ptr)
{
    return this_ptr->m_license_plate;
}
PublicTransportVTable g_public_transport_table = {PublicTransportDtor, PublicTransport_display};

