CXX ?= g++
TARGET ?= server

SRC_DIR := src
NET_SRC_DIR := ../tcp-udp/src/Net
INC_DIR := inc
NET_INC_DIR := ../tcp-udp/include/Net
SHARED_INC_DIR := ../tcp-udp/include
BUILD_DIR := build
OBJ_DIR := $(BUILD_DIR)/obj

APP_SRCS := $(wildcard $(SRC_DIR)/*.cpp)
NET_SRCS := $(wildcard $(NET_SRC_DIR)/*.cpp)
APP_OBJS := $(patsubst $(SRC_DIR)/%.cpp,$(OBJ_DIR)/%.o,$(APP_SRCS))
NET_OBJS := $(patsubst $(NET_SRC_DIR)/%.cpp,$(OBJ_DIR)/net_%.o,$(NET_SRCS))
OBJS := $(APP_OBJS) $(NET_OBJS)
DEPS := $(OBJS:.o=.d)

CPPFLAGS ?= -I$(INC_DIR) -I$(SHARED_INC_DIR) -I$(NET_INC_DIR)
CXXFLAGS ?= -std=c++98 -Wall -Wextra -Wpedantic -MMD -MP
LDFLAGS ?=
LDLIBS ?=

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CXX) $(OBJS) $(LDFLAGS) $(LDLIBS) -o $@

$(OBJ_DIR)/%.o: $(SRC_DIR)/%.cpp | $(OBJ_DIR)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) -c $< -o $@

$(OBJ_DIR)/net_%.o: $(NET_SRC_DIR)/%.cpp | $(OBJ_DIR)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) -c $< -o $@

$(OBJ_DIR):
	mkdir -p $(OBJ_DIR)

debug: CXXFLAGS += -O0 -g3
debug: clean all

release: CXXFLAGS += -O2 -DNDEBUG
release: clean all

run: all
	./$(TARGET)

clean:
	rm -rf $(BUILD_DIR)

fclean: clean
	rm -f $(TARGET)

re: fclean all

.PHONY: all debug release run clean fclean re

-include $(DEPS)
