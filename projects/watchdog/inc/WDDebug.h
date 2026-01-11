#ifndef ILRD_WD_COMMON_H
#define ILRD_WD_COMMON_H

#define _XOPEN_SOURCE 700

#include "Watchdog.h"
#include "WDCommon.h"

#include <sys/types.h>

#define COLOR_RED "\033[0;31m"
#define COLOR_GRN "\033[0;32m"
#define COLOR_MAG "\033[0;35m"
#define COLOR_YEL "\033[0;33m"
#define COLOR_BRI "\033[1;37m"
#define COLOR_END "\033[0m"

typedef enum debug_level
{
    WD_DEBUG = 0,
    HB_DEBUG = 1,
    MAIN_DEBUG = 2
} debug_level_t;

void WD_DBG_PRINT(const char* fmt_, ...);

void HB_DBG_PRINT(const char* fmt_, ...);

void MAIN_DBG_PRINT(const char* fmt_, ...);

void PRINT_ARGS(debug_level_t debug_lvl, wd_args_t* args);

#endif /* ILRD_WD_COMMON_H */
