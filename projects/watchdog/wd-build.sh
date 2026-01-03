#!/bin/bash

shopt -s expand_aliases

source ~/.bash_aliases

DS_PATH="/home/moranayal/repos/ILRD/git/ds"
PROJECTS_PATH="/home/moranayal/repos/ILRD/git/projects"
WATCHDOG_PATH="/home/moranayal/repos/ILRD/git/projects/watchdog"
UTILS_PATH="/home/moranayal/repos/ILRD/git/utils"

UID_SRC=$DS_PATH/src/UID.c
TASK=$DS_PATH/src/Task.c
PQ=$DS_PATH/src/PQ.c
HEAP=$DS_PATH/src/Heap.c
VECTOR=$DS_PATH/src/d_vector.c
SCHEDULER=$PROJECTS_PATH/src/Scheduler.c    
WD_CLIENT=$WATCHDOG_PATH/src/WDClient.c
WATCHDOG=$WATCHDOG_PATH/src/Watchdog.c
TEST=$WATCHDOG_PATH/test/WatchdogTest.c



gd $SCHEDULER $UID_SRC $TASK $PQ $HEAP $VECTOR $WD_CLIENT -I$DS_PATH/inc -I$UTILS_PATH/inc -I$PROJECTS_PATH/inc -I$WATCHDOG_PATH/inc -o $WATCHDOG_PATH/bin/wd_client

gd $SCHEDULER $UID_SRC $TASK $PQ $HEAP $VECTOR $WATCHDOG $TEST -I$DS_PATH/inc -I$UTILS_PATH/inc -I$PROJECTS_PATH/inc -I$WATCHDOG_PATH/inc -o $WATCHDOG_PATH/bin/wd_user_test