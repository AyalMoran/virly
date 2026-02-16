CXX := g++
CXXFLAGS := -std=c++98 -Wall -Wextra -O2
LDFLAGS := -pthread -lrt

TARGET := ipc_showcase
SRCS := \
	main.cpp \
	ipc_common.cpp \
	ipc_shared_memory.cpp \
	ipc_tcp.cpp \
	ipc_udp.cpp \
	ipc_unix_domain.cpp \
	ipc_message_queue.cpp \
	ipc_mmap.cpp

OBJS := $(SRCS:.cpp=.o)

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CXX) $(CXXFLAGS) -o $@ $(OBJS) $(LDFLAGS)

%.o: %.cpp ipc_common.hpp ipc_methods.hpp
	$(CXX) $(CXXFLAGS) -c $< -o $@

clean:
	rm -f $(OBJS) $(TARGET)

.PHONY: all clean
