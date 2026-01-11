#!/bin/bash
set -euo pipefail

shopt -s expand_aliases
source ~/.bash_aliases

DS_PATH="$HOME/repos/ILRD/git/ds"
PROJECTS_PATH="$HOME/repos/ILRD/git/projects"
WATCHDOG_PATH="$PROJECTS_PATH/watchdog"
UTILS_PATH="$HOME/repos/ILRD/git/utils"

BIN_DIR="$WATCHDOG_PATH/bin"
mkdir -p "$BIN_DIR"

UID_SRC="$DS_PATH/src/UID.c"
TASK="$DS_PATH/src/Task.c"
PQ="$DS_PATH/src/PQ.c"
HEAP="$DS_PATH/src/Heap.c"
VECTOR="$DS_PATH/src/d_vector.c"

SCHEDULER="$PROJECTS_PATH/src/Scheduler.c"

WD="$WATCHDOG_PATH/src/Watchdog.c"
WD_CLIENT="$WATCHDOG_PATH/src/WDClient.c" 
WD_COMMON="$WATCHDOG_PATH/src/WDCommon.c"
WD_DEBUG="$WATCHDOG_PATH/src/WDDebug.c"
TEST="$WATCHDOG_PATH/test/WatchdogTest.c"

SHARED_LIB="$BIN_DIR/libwd.so"

INCLUDES=(
    "-I$DS_PATH/inc"
    "-I$UTILS_PATH/inc"
    "-I$PROJECTS_PATH/inc"
    "-I$WATCHDOG_PATH/inc"
)

echo "Compiling shared library..."
gd -fPIC -shared "$WD" "$SCHEDULER" "$UID_SRC" "$TASK" "$PQ" "$HEAP" "$VECTOR" "$WD_COMMON" "$WD_DEBUG" "${INCLUDES[@]}" -o "$SHARED_LIB"
echo "Shared library built at $SHARED_LIB"

echo "Compiling wd client..."
gd "$WD_CLIENT" -L"$BIN_DIR" -lwd -Wl,-rpath,'$ORIGIN' "${INCLUDES[@]}"  -o "$BIN_DIR/wd_client"
echo "wd_client build complete."

echo "Compiling test..."
gd "$TEST" -L"$BIN_DIR" -lwd -Wl,-rpath,'$ORIGIN' "${INCLUDES[@]}" -o "$BIN_DIR/wd_user_test"
echo "wd_user_test build complete."


