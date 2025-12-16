/*
*************************************************************
 *  File        : DHCP.h
 *  Author      : Ayal Moran
 *  Reviewer    : Chen Mugany
 *  Date        : 11-12-2025
 **************************************************************/
#ifndef __DHCP_H__
#define __DHCP_H__

#include <stddef.h>/* size_t */

#define IP_BYTES (4)

typedef unsigned char uchar_t;

typedef struct DHCP dhcp_t;

typedef enum dhcp_status
{
    SUCCESS = 0,
	FAILURE_WRONG_NET = 1,
	FAILURE_FULL = 2,
	FAILURE_ALLOC = 3,
	FAILURE_ALREADY_FREE = 4

} dhcp_status_t;

/**
 * @brief Initializes a new DHCP object.
 * Must be released using DHCPDestroy after use.
 
 * @param subnet_id The network identifier IP.
 * @param subnet_mask_size Number of bits in the network mask (must be less than 31).
 * @return Pointer to the new DHCP object on success, NULL on failure.
 *
 * Time complexity: O(1)
 * Space complexity: O(1)
 */
dhcp_t* DHCPCreate(uchar_t net_addr[IP_BYTES], size_t subnet_mask_size);

/**
 * @brief Releases resources held by a DHCP object.
 * @param dhcp Pointer to the DHCP object to destroy (must not be NULL).
 *
 * Time complexity: O(n)
 * Space complexity: O(1)
 */
void DHCPDestroy(dhcp_t* dhcp);

/**
 * @brief Allocates an IP address from the DHCP pool.
 * @param dhcp Pointer to the DHCP object (must not be NULL).
 * @param request Preferred IP address to allocate, if available.
 *               If unavailable, the next available IP will be assigned.
 * @param allocated_ip Output parameter for the allocated IP address.
 * @return SUCCESS on successful allocation,
 *         ERR_ALLOC if memory allocation fails,
 *         ERR_INVALID_ADDRESS if the requested IP is invalid,
 *         ERR_FULL if no IP addresses are available.
 *
 * Time complexity: O(1)
 * Space complexity: O(1)
 */
dhcp_status_t DHCPAlloc(dhcp_t* dhcp, uchar_t ip_req[IP_BYTES], uchar_t out_ip_received[IP_BYTES]);

/**
 * @brief Frees a previously allocated IP address.
 * @param dhcp Pointer to the DHCP object (must not be NULL).
 * @param to_free The IP address to release.
 * @return SUCCESS if the IP was successfully freed,
 *         ERR_INVALID_ADDRESS if the IP is invalid,
 *         ERR_DOUBLE_FREE if the IP was already free or never allocated.
 *
 * Time complexity: O(1)
 * Space complexity: O(1)
 */
dhcp_status_t DHCPFree(dhcp_t* dhcp, uchar_t ip[IP_BYTES]);

/**
 * @brief Returns the number of available IP addresses for allocation.
 * @param dhcp Pointer to the DHCP object (must not be NULL).
 * @return Number of free IP addresses.
 *
 * Time complexity: O(n)
 * Space complexity: O(1)
 */
size_t DHCPFreeCount(const dhcp_t* dhcp);

#endif /* __DHCP_H__ */
