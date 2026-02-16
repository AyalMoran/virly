CXX := g++
CXXFLAGS := -Wall -Wextra -Werror -pedantic -std=c++98 -pthread
RELEASE_FLAGS := -O3 -DNET_DISABLE_LOGS
INCLUDES := -Iinclude

OBJDIR := obj
BINDIR := bin

NET_SRC := \
	src/Net/Endpoint.cpp \
	src/Net/SocketBase.cpp \
	src/Net/UdpSocket.cpp \
	src/Net/TcpSocket.cpp \
	src/Net/MessageBuilder.cpp \
	src/Net/SignalManager.cpp \
	src/Net/Logger.cpp

APP_COMMON_SRC := src/App/CommandLineOptions.cpp

UDP_PING_SERVER_SRC := src/App/UdpPingServer.cpp mains/UdpPingServerMain.cpp
UDP_PING_CLIENT_SRC := src/App/UdpPingClient.cpp mains/UdpPingClientMain.cpp
TCP_PING_SERVER_SRC := src/App/TcpPingServer.cpp mains/TcpPingServerMain.cpp
TCP_PING_CLIENT_SRC := src/App/TcpPingClient.cpp mains/TcpPingClientMain.cpp
UDP_BCAST_SENDER_SRC := src/App/UdpBroadcastSender.cpp mains/UdpBroadcastSenderMain.cpp
UDP_BCAST_LISTENER_SRC := src/App/UdpBroadcastListener.cpp mains/UdpBroadcastListenerMain.cpp

COMMON_OBJ := $(patsubst %.cpp,$(OBJDIR)/%.o,$(NET_SRC) $(APP_COMMON_SRC))

UDP_PING_SERVER_OBJ := $(COMMON_OBJ) $(patsubst %.cpp,$(OBJDIR)/%.o,$(UDP_PING_SERVER_SRC))
UDP_PING_CLIENT_OBJ := $(COMMON_OBJ) $(patsubst %.cpp,$(OBJDIR)/%.o,$(UDP_PING_CLIENT_SRC))
TCP_PING_SERVER_OBJ := $(COMMON_OBJ) $(patsubst %.cpp,$(OBJDIR)/%.o,$(TCP_PING_SERVER_SRC))
TCP_PING_CLIENT_OBJ := $(COMMON_OBJ) $(patsubst %.cpp,$(OBJDIR)/%.o,$(TCP_PING_CLIENT_SRC))
UDP_BCAST_SENDER_OBJ := $(COMMON_OBJ) $(patsubst %.cpp,$(OBJDIR)/%.o,$(UDP_BCAST_SENDER_SRC))
UDP_BCAST_LISTENER_OBJ := $(COMMON_OBJ) $(patsubst %.cpp,$(OBJDIR)/%.o,$(UDP_BCAST_LISTENER_SRC))

TARGETS := \
	$(BINDIR)/UdpPingServer \
	$(BINDIR)/UdpPingClient \
	$(BINDIR)/TcpPingServer \
	$(BINDIR)/TcpPingClient \
	$(BINDIR)/UdpBroadcastSender \
	$(BINDIR)/UdpBroadcastListener

.PHONY: all clean fclean re debug

all: $(TARGETS)

$(BINDIR)/UdpPingServer: $(UDP_PING_SERVER_OBJ)
	@mkdir -p $(BINDIR)
	$(CXX) $(CXXFLAGS) $^ -o $@

$(BINDIR)/UdpPingClient: $(UDP_PING_CLIENT_OBJ)
	@mkdir -p $(BINDIR)
	$(CXX) $(CXXFLAGS) $^ -o $@

$(BINDIR)/TcpPingServer: $(TCP_PING_SERVER_OBJ)
	@mkdir -p $(BINDIR)
	$(CXX) $(CXXFLAGS) $^ -o $@

$(BINDIR)/TcpPingClient: $(TCP_PING_CLIENT_OBJ)
	@mkdir -p $(BINDIR)
	$(CXX) $(CXXFLAGS) $^ -o $@

$(BINDIR)/UdpBroadcastSender: $(UDP_BCAST_SENDER_OBJ)
	@mkdir -p $(BINDIR)
	$(CXX) $(CXXFLAGS) $^ -o $@

$(BINDIR)/UdpBroadcastListener: $(UDP_BCAST_LISTENER_OBJ)
	@mkdir -p $(BINDIR)
	$(CXX) $(CXXFLAGS) $^ -o $@

$(OBJDIR)/%.o: %.cpp
	@mkdir -p $(dir $@)
	$(CXX) $(CXXFLAGS) $(INCLUDES) -c $< -o $@

clean:
	rm -rf $(OBJDIR)

fclean: clean
	rm -rf $(BINDIR)

re: fclean all

debug: CXXFLAGS += -g -O0

debug: re

release: CXXFLAGS += $(RELEASE_FLAGS)

release: re