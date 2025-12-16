/*
*************************************************************
 *  File        : DHCP.c
 *  Author      : Ayal Moran
 *  Reviewer    : Chen Mugany
 *  Date        : 11-12-2025
 **************************************************************/
#include <assert.h>/* assert */
#include <limits.h>/* CHAR_BIT */
#include <stdlib.h>/* malloc */
#include <string.h>/* memcpy */

#include "DHCP.h" /* dhcp_t */
#include "Trie.h" /* TrieCreate */

struct DHCP
{
    uint32_t net_id;
    size_t subnet_size;
    trie_t* trie;
};

typedef uchar_t ip_t[4];
#define TRUE (1)
#define FALSE (0)

#define NETWORK_ADD (0u)
#define SERVER_ADD (~0u << 1)
#define BROADCAST_ADD (~0u)

#define BITS_IN_HOST_ID(dhcp) (IP_BYTES * CHAR_BIT - dhcp->subnet_size)
#define MSB_MASK(mask_size) (~((uint32_t) (~0) >> (mask_size)))
#define LSB_MASK(mask_size) (~((uint32_t) (~0) << (mask_size)))

static int IsValidNetId(dhcp_t* dhcp, uint32_t ip);
static int IsSavedIp(dhcp_t* dhcp, uint32_t ip);
static int IsSameHostId(dhcp_t* dhcp, uint32_t ip1, uint32_t ip2);
static uint32_t IPAddrToInt(const ip_t ip);
static void IntToIPAddr(ip_t dest, uint32_t src);
static uint32_t ExtractHostId(const dhcp_t* dhcp, uint32_t ip);
static dhcp_status_t InitDHCPMembers(dhcp_t* dhcp, uint32_t net_addr, size_t subnet_mask_size);

dhcp_t* DHCPCreate(uchar_t net_addr[IP_BYTES], size_t subnet_mask_size)
{
    dhcp_t* dhcp = NULL;
    int32_t result_host = 0;
    size_t host_bits = 0;
    int status = 0;

    assert(subnet_mask_size < IP_BYTES * CHAR_BIT - 1);
    assert(net_addr);

    
    dhcp = (dhcp_t*) malloc(sizeof(dhcp_t));
    if (NULL == dhcp)
    {
        return NULL;
    }
    
    status = InitDHCPMembers(dhcp, IPAddrToInt(net_addr), subnet_mask_size);
    if (SUCCESS != status)
    {
        free(dhcp);
        dhcp = NULL;
        return dhcp;
    }

    host_bits = BITS_IN_HOST_ID(dhcp);
    if (0 != TrieInsert(dhcp->trie, NETWORK_ADD & LSB_MASK(host_bits), &  result_host) ||
        0 != TrieInsert(dhcp->trie, SERVER_ADD & LSB_MASK(host_bits), &result_host) ||
        0 != TrieInsert(dhcp->trie, BROADCAST_ADD & LSB_MASK(host_bits), &result_host))
    {
        TrieDestroy(dhcp->trie);
        dhcp->trie = NULL;
        free(dhcp);
        return NULL;
    }

    return dhcp;
}

void DHCPDestroy(dhcp_t* dhcp)
{
    assert(dhcp);

    TrieDestroy(dhcp->trie);
    dhcp->trie = NULL;
}

dhcp_status_t DHCPAlloc(dhcp_t* dhcp, uchar_t ip_req[IP_BYTES], uchar_t out_ip_received[IP_BYTES])
{
    int32_t  new_ip     = 0;
    int32_t  host_id    = 0;
    
    assert(NULL != dhcp);
    assert(NULL != ip_req);
    assert(NULL != out_ip_received);

    new_ip = IPAddrToInt(ip_req);

    if (!IsValidNetId(dhcp, new_ip))
    {
        return FAILURE_WRONG_NET;
    }

    host_id = ExtractHostId(dhcp, new_ip);

    switch (TrieInsert(dhcp->trie, host_id, &host_id))
    {
    case TRIE_ERR_FULL:
        return FAILURE_FULL;
    case TRIE_ERR_ALLOC:
        return FAILURE_ALLOC;
    case TRIE_SUCCESS:
        new_ip = (dhcp->net_id & MSB_MASK(dhcp->subnet_size)) | host_id;
        IntToIPAddr(out_ip_received, new_ip);
        return SUCCESS;
    }
    return SUCCESS;
}

dhcp_status_t DHCPFree(dhcp_t* dhcp, uchar_t ip[IP_BYTES])
{
    uint32_t to_free = 0;

    assert(NULL != dhcp);
    assert(NULL != ip);

    to_free = IPAddrToInt(ip);

    if (!IsValidNetId(dhcp, to_free) || IsSavedIp(dhcp, to_free))
    {
        return FAILURE_WRONG_NET;
    }

    if (TrieRemove(dhcp->trie, ExtractHostId(dhcp, to_free)))
    {
        return FAILURE_ALREADY_FREE;
    }

    return SUCCESS;
}

size_t DHCPFreeCount(const dhcp_t* dhcp)
{
    assert(NULL != dhcp);

    return (0x1 << BITS_IN_HOST_ID(dhcp)) - TrieCount(dhcp->trie);
}

static dhcp_status_t InitDHCPMembers(dhcp_t* dhcp, uint32_t net_addr, size_t subnet_mask_size)
{
    assert(NULL != dhcp);

    dhcp->net_id = net_addr;
    dhcp->subnet_size = subnet_mask_size;
    dhcp->trie = TrieCreate(BITS_IN_HOST_ID(dhcp));
    if (NULL == dhcp->trie)
    {
        return FAILURE_ALLOC;
    }

    return SUCCESS;
}
static int IsValidNetId(dhcp_t* dhcp, uint32_t ip)
{
    assert(NULL != dhcp);

    return (dhcp->net_id & MSB_MASK(dhcp->subnet_size)) ==
           (ip & MSB_MASK(dhcp->subnet_size));
}

static int IsSavedIp(dhcp_t* dhcp, uint32_t ip)
{
    assert(NULL != dhcp);
    assert(NULL != ip);

    return IsSameHostId(dhcp, NETWORK_ADD, ip) ||
           IsSameHostId(dhcp, SERVER_ADD, ip) ||
           IsSameHostId(dhcp, BROADCAST_ADD, ip);
}

static int IsSameHostId(dhcp_t* dhcp, uint32_t ip1, uint32_t ip2)
{
    assert(NULL != dhcp);

    return (ip1 & LSB_MASK(BITS_IN_HOST_ID(dhcp))) ==
           (ip2 & LSB_MASK(BITS_IN_HOST_ID(dhcp)));
}

static uint32_t IPAddrToInt(const ip_t ip)
{
    size_t i = 0;
    uint32_t res = 0;

    assert(NULL != ip);

    for (; i < IP_BYTES; ++i)
    {
        res <<= CHAR_BIT;
        res |= ip[i];
    }

    return res;
}

static void IntToIPAddr(ip_t dest, uint32_t src)
{
    size_t i = 0;

    assert(NULL != dest);

    for (; i < IP_BYTES; ++i)
    {
        dest[IP_BYTES - i - 1] = (src >> (CHAR_BIT * i)) & 0xFF;
    }
}

static uint32_t ExtractHostId(const dhcp_t* dhcp, uint32_t ip)
{
    assert(NULL != dhcp);

    return ip & LSB_MASK(BITS_IN_HOST_ID(dhcp));
}
