#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="/home/moranayal/repos/ILRD/git/cpp"
INCLUDE_DIR="$ROOT_DIR/include"
SRC_DIR="$ROOT_DIR/src"

g++ -std=c++20 -Wall -Wextra -Wpedantic \
  -I"$INCLUDE_DIR" \
  Handleton.cpp \
  "$SRC_DIR/Pauser.cpp" \
  "$SRC_DIR/PriorityQueue.cpp" \
  "$SRC_DIR/ThreadMap.cpp" \
  "$SRC_DIR/ThreadPool.cpp" \
  "$SRC_DIR/ThreadPoolTasks.cpp" \
  "$SRC_DIR/WaitableQueue.cpp" \
  -pthread -ldl -o Handleton

g++ -std=c++20 -Wall -Wextra -Wpedantic -shared -fPIC \
  -I"$INCLUDE_DIR" \
  plugin.cpp \
  "$SRC_DIR/Pauser.cpp" \
  "$SRC_DIR/PriorityQueue.cpp" \
  "$SRC_DIR/ThreadMap.cpp" \
  "$SRC_DIR/ThreadPool.cpp" \
  "$SRC_DIR/ThreadPoolTasks.cpp" \
  "$SRC_DIR/WaitableQueue.cpp" \
  -pthread -o plugin.so

./Handleton
