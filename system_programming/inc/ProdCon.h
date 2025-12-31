/**************************************************************
 * File    : ProdCon.c
 * Author  : Ayal Moran
 * Reviewer: Yohai S.
 * Date    : 31-12-2025
 **************************************************************/
#ifndef _ILRD_PRODCON_H
#define _ILRD_PRODCON_H

typedef enum prod_con_status
{
    PROD_CON_SUCCESS = 0,
    PROD_CON_ALLOC_FAILURE,
    PROD_CON_JOIN_FAILURE,
    PROD_CON_CREATE_FAILURE
} prod_con_status_t;

prod_con_status_t ProdCon();
#endif  /* _ILRD_PRODCON_H */
