/*
*************************************************************
 *  File        : DHCPTest.c
 *  Author      : Ayal Moran
 *  Reviewer    : Chen Mugany
 *  Date        : 11-12-2025
 **************************************************************/
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>

#include "DHCP.h"
#include "test_utils.h"

static void RegisterTests(void);

/******************************************************
 * START OF ACTUAL TESTS
 ******************************************************/
#define SHOW_IP(ip) printf("%s: %d.%d.%d.%d\n", #ip, ip[0], ip[1], ip[2], ip[3]);

static void Test_Create(void)
{
    uchar_t net_addr[IP_BYTES] = {192, 168, 1, 0};
    size_t subnet_mask_size = 24;
    
    INIT_SUITE(create, "CREATE");

    dhcp_t* dhcp = DHCPCreate(net_addr, subnet_mask_size);
    RUN_TEST(create, "DHCPCreate returns non-NULL", dhcp != NULL);
    DHCPDestroy(dhcp);

    printf("== [%s] %d/%d Passed ==\n", create.name, create.passed,
           create.total);
}

static void Test_Alloc(void)
{
    uchar_t net_addr[IP_BYTES] = {192, 0, 0, 0};
    size_t subnet_mask_size = 3;
    uchar_t ip_req[IP_BYTES] = {192, 0, 0, 1};
    uchar_t out_ip_received[IP_BYTES] = {0};
    uchar_t expected_ip[IP_BYTES] = {0};
    INIT_SUITE(alloc, "ALLOC");
    dhcp_status_t status = SUCCESS;
    size_t i = 0;

    dhcp_t* dhcp = DHCPCreate(net_addr, subnet_mask_size);

    /* Test allocation of first IP */
    status = DHCPAlloc(dhcp, ip_req, out_ip_received);
    SHOW_INT(status);
    RUN_TEST(alloc, "DHCPAlloc returns SUCCESS", SUCCESS == status);
    ASSERT_MEM_EQ(alloc, out_ip_received, ip_req, IP_BYTES);
    SHOW_IP(ip_req);
    SHOW_IP(out_ip_received);

    /* Test allocation of next IP */
    ++ip_req[3];
    memset(out_ip_received, 0, IP_BYTES);
    status = DHCPAlloc(dhcp, ip_req, out_ip_received);
    SHOW_INT(status);
    RUN_TEST(alloc, "DHCPAlloc returns SUCCESS", SUCCESS == status);
    ASSERT_MEM_EQ(alloc, out_ip_received, ip_req, IP_BYTES);
    SHOW_IP(ip_req);
    SHOW_IP(out_ip_received);
    /* Test allocation of next IP */
    ++ip_req[3];
    memset(out_ip_received, 0, IP_BYTES);
    status = DHCPAlloc(dhcp, ip_req, out_ip_received);
    SHOW_INT(status);
    RUN_TEST(alloc, "DHCPAlloc returns SUCCESS", SUCCESS == status);
    ASSERT_MEM_EQ(alloc, out_ip_received, ip_req, IP_BYTES);
    SHOW_IP(ip_req);
    SHOW_IP(out_ip_received);

    /* Test allocation of IP that is not in the network - wrong network */
    ip_req[0] = 23;
    ip_req[1] = 0;
    ip_req[2] = 0;
    ip_req[3] = 0;

    memset(out_ip_received, 0, IP_BYTES);
    status = DHCPAlloc(dhcp, ip_req, out_ip_received);
    SHOW_INT(status);
    RUN_TEST(alloc, "DHCPAlloc returns FAILURE_WRONG_NET", FAILURE_WRONG_NET == status);

    
    /* Test allocation of IP that is already allocated gets minimum free ip */
    ip_req[0] = 192;
    ip_req[1] = 0;
    ip_req[2] = 0;
    ip_req[3] = 120;    
    DHCPAlloc(dhcp, ip_req, out_ip_received);
    status = DHCPAlloc(dhcp, ip_req, out_ip_received);
    expected_ip[0] = 192;
    expected_ip[1] = 0;
    expected_ip[2] = 0;
    expected_ip[3] = 4;
    SHOW_INT(status);
    RUN_TEST(alloc, "DHCPAlloc of already allocated ip returns SUCCESS and gets minimum free ip", SUCCESS == status);
    ASSERT_MEM_EQ(alloc, out_ip_received, expected_ip, IP_BYTES);
    SHOW_IP(ip_req);
    SHOW_IP(out_ip_received);

    DHCPDestroy(dhcp);

    printf("== [%s] %d/%d Passed ==\n", alloc.name, alloc.passed,
           alloc.total);
}

static void Test_Free(void)
{
    uchar_t net_addr[IP_BYTES] = {192, 0, 0, 0};
    size_t subnet_mask_size = 3;
    uchar_t ip_req[IP_BYTES] = {192, 0, 0, 1};
    uchar_t out_ip_received[IP_BYTES] = {0};
    uchar_t expected_ip[IP_BYTES] = {0};
    dhcp_status_t status = SUCCESS;
    size_t i = 0;
    uchar_t to_free[IP_BYTES] = {0};
    dhcp_t* dhcp = DHCPCreate(net_addr, subnet_mask_size);
    
    INIT_SUITE(_free, "FREE");

    status = DHCPAlloc(dhcp, ip_req, out_ip_received);

    ++ip_req[3];
    memset(out_ip_received, 0, IP_BYTES);
    status = DHCPAlloc(dhcp, ip_req, out_ip_received);
    ++ip_req[3];
    memset(out_ip_received, 0, IP_BYTES);
    status = DHCPAlloc(dhcp, ip_req, out_ip_received);
    ip_req[0] = 23;
    ip_req[1] = 0;
    ip_req[2] = 0;
    ip_req[3] = 0;
    memset(out_ip_received, 0, IP_BYTES);
    status = DHCPAlloc(dhcp, ip_req, out_ip_received);
  
    ip_req[0] = 192;
    ip_req[1] = 0;
    ip_req[2] = 0;
    ip_req[3] = 120;    
    DHCPAlloc(dhcp, ip_req, out_ip_received);
    status = DHCPAlloc(dhcp, ip_req, out_ip_received);
    /*same as Alloc tests ^^^*/

    to_free[0] = 192;
    to_free[1] = 0;
    to_free[2] = 0;
    to_free[3] = 120;
    status = DHCPFree(dhcp, to_free);
    RUN_TEST(_free, "DHCPFree returns SUCCESS", SUCCESS == status);
    status= DHCPAlloc(dhcp, ip_req, out_ip_received);
    RUN_TEST(_free, "DHCPAlloc returns SUCCESS", SUCCESS == status);
    ASSERT_MEM_EQ(_free, out_ip_received, ip_req, IP_BYTES);
    SHOW_IP(ip_req);
    SHOW_IP(out_ip_received);

    DHCPDestroy(dhcp);

    printf("== [%s] %d/%d Passed ==\n", _free.name, _free.passed,
           _free.total);
}   
int main(void)
{
    int i = 0;

    PRINT_TEST_HEADER("OVERALL");
    printf("===================\n");

    RegisterTests();

    for (i = 0; i < test_count; ++i)
    {
        printf("Running Suite: %s\n",     test_registry[i].name);
        test_registry[i].func();
    }

    PRINT_SUMMARY();
    
    return 0;
}

static void RegisterTests(void)
{
    REGISTER_TEST(Test_Create);
    REGISTER_TEST(Test_Alloc);
    REGISTER_TEST(Test_Free);
}
