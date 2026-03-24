#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
BIN_PATH="$BUILD_DIR/HandletonTest"
HANDLETON_SO="$BUILD_DIR/libHandleton.so"
PLUGIN_SO="$BUILD_DIR/CorrectPlugin.so"

INCLUDE_DIR="$ROOT_DIR/include"
OTHER_INCLUDE_DIR="$ROOT_DIR/other/handleton"
UTILS_INCLUDE_DIR="$ROOT_DIR/../utils/inc"
UTILS_SRC="$ROOT_DIR/../utils/src/test_utils.cpp"

mkdir -p "$BUILD_DIR"

echo "Compiling libHandleton..."
g++ -std=c++20 -Wall -Wextra -Wpedantic -O2 -Weffc++ -Werror \
  -I"$INCLUDE_DIR" \
  -I"$OTHER_INCLUDE_DIR" \
  "$ROOT_DIR/other/handleton/HandletonImpl.cpp" \
  "$ROOT_DIR/src/Pauser.cpp" \
  "$ROOT_DIR/src/PriorityQueue.cpp" \
  "$ROOT_DIR/src/ThreadMap.cpp" \
  "$ROOT_DIR/src/ThreadPool.cpp" \
  "$ROOT_DIR/src/ThreadPoolTasks.cpp" \
  "$ROOT_DIR/src/WaitableQueue.cpp" \
  -shared -fPIC -pthread \
  -Wl,-soname,libHandleton.so \
  -o "$HANDLETON_SO"

echo "Compiling CorrectPlugin..."
g++ -std=c++20 -Wall -Wextra -Wpedantic -O2 -Weffc++ -Werror \
  -I"$INCLUDE_DIR" \
  -I"$OTHER_INCLUDE_DIR" \
  "$ROOT_DIR/other/handleton/CorrectPlugin.cpp" \
  -L"$BUILD_DIR" -lHandleton \
  -shared -fPIC \
  -Wl,--no-undefined \
  -Wl,-rpath,'$ORIGIN' \
  -o "$PLUGIN_SO"


echo "Compiling HandletonTest..."
g++ -std=c++20 -Wall -Wextra -Wpedantic -O2 -Weffc++ -Werror \
  -I"$INCLUDE_DIR" \
  -I"$UTILS_INCLUDE_DIR" \
  "$ROOT_DIR/test/HandletonTest.cpp" \
  "$UTILS_SRC" \
  -L"$BUILD_DIR" -lHandleton \
  -pthread -ldl \
  -Wl,-rpath,'$ORIGIN' \
  -o "$BIN_PATH"


echo "Running HandletonTest..."
"$BIN_PATH"
echo "HandletonTest completed."
