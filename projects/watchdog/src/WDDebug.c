
#include "WDCommon.h"
#include "WDDebug.h"

#define TABS10 "                                                      "
#define WD_TABS TABS10 TABS10
#define HB_TABS TABS10


#ifndef NDEBUG
#    include <stdarg.h> /* va_list */
#    include <stdio.h>  /* vprintf */

void WD_DBG_PRINT(const char* fmt_, ...)
{
    va_list ap_;

    va_start(ap_, fmt_);
    vprintf(COLOR_GRN, ap_);
    vprintf(WD_TABS, ap_);
    vprintf("[WD]: ", ap_);
    vprintf(fmt_, ap_);
    vprintf(COLOR_END, ap_);
    fflush(stdout);
    va_end(ap_);
}
void HB_DBG_PRINT(const char* fmt_, ...)
{
    va_list ap_;

    va_start(ap_, fmt_);
    vprintf(COLOR_MAG, ap_);
    vprintf(HB_TABS, ap_);
    vprintf("[HB]: ", ap_);
    vprintf(fmt_, ap_);
    vprintf(COLOR_END, ap_);
    fflush(stdout);
    va_end(ap_);
}
void MAIN_DBG_PRINT(const char* fmt_, ...)
{
    va_list ap_;

    va_start(ap_, fmt_);
    vprintf(COLOR_BRI, ap_);
    vprintf("[MAIN]: ", ap_);
    vprintf(fmt_, ap_);
    vprintf(COLOR_END, ap_);
    fflush(stdout);
    va_end(ap_);
}

void PRINT_ARGS(debug_level_t debug_lvl, wd_args_t* args)
{
    switch (debug_lvl)
    {
    case WD_DEBUG:
        WD_DBG_PRINT("================================================\n");
        WD_DBG_PRINT("args->pid: %d\n", args->pid);
        WD_DBG_PRINT("args->heart: %p\n", (void*) args->heart);
        WD_DBG_PRINT("args->dog_gate: %p\n", (void*) args->dog_gate);
        WD_DBG_PRINT("args->user_sem: %p\n", (void*) &args->user_sem);
        WD_DBG_PRINT("args->exec_argv: %p\n", (void*) args->exec_argv);
        WD_DBG_PRINT("args->interval: %zu\n", args->interval);
        WD_DBG_PRINT("args->misses_threshold: %zu\n", args->misses_threshold);
        WD_DBG_PRINT("args->interval_str: %s\n", args->interval_str);
        WD_DBG_PRINT("args->misses_str: %s\n", args->misses_str);
        WD_DBG_PRINT("================================================\n");
        break;
    case HB_DEBUG:
        HB_DBG_PRINT("================================================\n");
        HB_DBG_PRINT("args->pid: %d\n", args->pid);
        HB_DBG_PRINT("args->heart: %p\n", (void*) args->heart);
        HB_DBG_PRINT("args->dog_gate: %p\n", (void*) args->dog_gate);
        HB_DBG_PRINT("args->user_sem: %p\n", (void*) &args->user_sem);
        HB_DBG_PRINT("args->exec_argv: %p\n", (void*) args->exec_argv);
        HB_DBG_PRINT("args->interval: %zu\n", args->interval);
        HB_DBG_PRINT("args->misses_threshold: %zu\n", args->misses_threshold);
        HB_DBG_PRINT("args->interval_str: %s\n", args->interval_str);
        HB_DBG_PRINT("args->misses_str: %s\n", args->misses_str);
        HB_DBG_PRINT("================================================\n");
        break;
    case MAIN_DEBUG:
        MAIN_DBG_PRINT("================================================\n");
        MAIN_DBG_PRINT("args->pid: %d\n", args->pid);
        MAIN_DBG_PRINT("args->heart: %p\n", (void*) args->heart);
        MAIN_DBG_PRINT("args->dog_gate: %p\n", (void*) args->dog_gate);
        MAIN_DBG_PRINT("args->user_sem: %p\n", (void*) &args->user_sem);
        MAIN_DBG_PRINT("args->exec_argv: %p\n", (void*) args->exec_argv);
        MAIN_DBG_PRINT("args->interval: %zu\n", args->interval);
        MAIN_DBG_PRINT("args->misses_threshold: %zu\n", args->misses_threshold);
        MAIN_DBG_PRINT("args->interval_str: %s\n", args->interval_str);
        MAIN_DBG_PRINT("args->misses_str: %s\n", args->misses_str);
        MAIN_DBG_PRINT("================================================\n");
        break;
    default:
        break;
    }
}
#else
void WD_DBG_PRINT(const char* fmt_, ...)
{
    (void) fmt_;
}
void HB_DBG_PRINT(const char* fmt_, ...)
{
    (void) fmt_;
}
void MAIN_DBG_PRINT(const char* fmt_, ...)
{
    (void) fmt_;
}
void PRINT_ARGS(debug_level_t debug_lvl, wd_args_t* args)
{
    (void) debug_lvl;
    (void) args;
}
#endif /* NDEBUG */