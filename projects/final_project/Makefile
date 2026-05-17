CXX := g++
CXXFLAGS := -std=c++20 -Wall -Wextra -pedantic -pthread
CPPFLAGS := -Iframework/include \
	-Iconcrete/common/include \
	-Iconcrete/master/include \
	-Iconcrete/minion/include \
	-Iutils
LDFLAGS := -pthread -ldl -lrt
MINION_RPI_CXX := arm-linux-gnueabihf-g++
MINION_RPI_CXXFLAGS := $(CXXFLAGS)
MINION_RPI_CPPFLAGS := $(CPPFLAGS)
MINION_RPI_LDFLAGS := $(LDFLAGS)

BUILD_DIR := build
OBJ_DIR := $(BUILD_DIR)/obj
OBJ_DIR_RPI := $(BUILD_DIR)/obj-rpi
TEST_DIR := $(BUILD_DIR)/test

FRAMEWORK_SRCS := $(filter-out framework/test/%.cpp,$(wildcard framework/src/*.cpp))
CONCRETE_COMMON_SRCS := $(wildcard concrete/common/src/*.cpp)
CONCRETE_MASTER_SRCS := $(wildcard concrete/master/src/*.cpp)
CONCRETE_MINION_SRCS := $(wildcard concrete/minion/src/*.cpp)
CONCRETE_SRCS := $(CONCRETE_COMMON_SRCS) $(CONCRETE_MASTER_SRCS) $(CONCRETE_MINION_SRCS)
UTIL_SRCS := utils/test_utils.cpp

CORE_SRCS := $(FRAMEWORK_SRCS) $(CONCRETE_SRCS)
CORE_OBJS := $(patsubst %.cpp,$(OBJ_DIR)/%.o,$(CORE_SRCS))
MINION_RPI_CORE_OBJS := $(patsubst %.cpp,$(OBJ_DIR_RPI)/%.o,$(CORE_SRCS))
UTIL_OBJS := $(patsubst %.cpp,$(OBJ_DIR)/%.o,$(UTIL_SRCS))
MINION_OBJ := $(OBJ_DIR)/concrete/minion/app/MinionMain.o
MINION_RPI_OBJ := $(OBJ_DIR_RPI)/concrete/minion/app/MinionMain.o
MASTER_SIM_OBJ := $(OBJ_DIR)/concrete/master/app/MasterSimMain.o
MASTER_NBD_OBJ := $(OBJ_DIR)/concrete/master/app/MasterNBDMain.o

CONCRETE_TEST_SRCS := concrete/common/test/ConcreteTasksTest.cpp \
	concrete/common/test/SerializerTest.cpp \
	concrete/common/test/UUIDTest.cpp \
	concrete/common/test/WireProtocolTest.cpp \
	concrete/master/test/MasterCommandsTest.cpp \
	concrete/master/test/MasterMetadataTest.cpp \
	concrete/master/test/MinionProxyTest.cpp \
	concrete/master/test/MinionResponseProxyTest.cpp \
	concrete/master/test/NBDCommunicatorTest.cpp \
	concrete/master/test/NBDProxyTest.cpp \
	concrete/master/test/ResponseManagerTest.cpp \
	concrete/minion/test/MasterProxyTest.cpp \
	concrete/minion/test/MinionCommandsTest.cpp \
	concrete/minion/test/MinionStorageBackendTest.cpp \
	concrete/minion/test/MinionSmokeTest.cpp

CONCRETE_TEST_BINS := $(patsubst %.cpp,$(TEST_DIR)/%,$(CONCRETE_TEST_SRCS))

.PHONY: all minion minion-rpi master-sim master-nbd simulation concrete-tests test clean dirs

all: minion master-sim master-nbd concrete-tests

minion: $(BUILD_DIR)/minion

minion-rpi: $(BUILD_DIR)/minion_rpi

master-sim: $(BUILD_DIR)/master_sim

master-nbd: $(BUILD_DIR)/master_nbd

run_single_machine_sim: minion master-sim
	./scripts/run_single_machine_sim.sh

run_single_machine_nbd: minion master-nbd
	./scripts/run_single_machine_nbd.sh

concrete-tests: $(CONCRETE_TEST_BINS)

test: concrete-tests
	@set -e; \
	for test_bin in $(CONCRETE_TEST_BINS); do \
		echo "Running $$test_bin"; \
		ILRD_MINION_BINARY=$(abspath $(BUILD_DIR)/minion) $$test_bin; \
	done

$(BUILD_DIR)/minion: $(CORE_OBJS) $(MINION_OBJ) | dirs
	$(CXX) $(CXXFLAGS) -o $@ $(CORE_OBJS) $(MINION_OBJ) $(LDFLAGS)

$(BUILD_DIR)/minion_rpi: $(MINION_RPI_CORE_OBJS) $(MINION_RPI_OBJ) | dirs
	$(MINION_RPI_CXX) $(MINION_RPI_CXXFLAGS) -o $@ $(MINION_RPI_CORE_OBJS) $(MINION_RPI_OBJ) $(MINION_RPI_LDFLAGS)

$(BUILD_DIR)/master_sim: $(CORE_OBJS) $(MASTER_SIM_OBJ) | dirs
	$(CXX) $(CXXFLAGS) -o $@ $(CORE_OBJS) $(MASTER_SIM_OBJ) $(LDFLAGS)

$(BUILD_DIR)/master_nbd: $(CORE_OBJS) $(MASTER_NBD_OBJ) | dirs
	$(CXX) $(CXXFLAGS) -o $@ $(CORE_OBJS) $(MASTER_NBD_OBJ) $(LDFLAGS)

$(TEST_DIR)/%: %.cpp $(CORE_OBJS) $(UTIL_OBJS) $(BUILD_DIR)/minion | dirs
	@mkdir -p $(dir $@)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) -o $@ $< $(CORE_OBJS) $(UTIL_OBJS) $(LDFLAGS)

$(OBJ_DIR)/framework/src/Framework.o: framework/src/Framework.cpp | dirs
	@mkdir -p $(dir $@)
	$(CXX) $(CPPFLAGS) -DI_AM_THE_HANDLETON_IMPLEMENTER $(CXXFLAGS) -c $< -o $@

$(OBJ_DIR_RPI)/framework/src/Framework.o: framework/src/Framework.cpp | dirs
	@mkdir -p $(dir $@)
	$(MINION_RPI_CXX) $(MINION_RPI_CPPFLAGS) -DI_AM_THE_HANDLETON_IMPLEMENTER $(MINION_RPI_CXXFLAGS) -c $< -o $@

$(OBJ_DIR)/%.o: %.cpp | dirs
	@mkdir -p $(dir $@)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) -c $< -o $@

$(OBJ_DIR_RPI)/%.o: %.cpp | dirs
	@mkdir -p $(dir $@)
	$(MINION_RPI_CXX) $(MINION_RPI_CPPFLAGS) $(MINION_RPI_CXXFLAGS) -c $< -o $@

dirs:
	@mkdir -p $(BUILD_DIR) $(OBJ_DIR) $(OBJ_DIR_RPI) $(TEST_DIR)

clean:
	rm -rf $(BUILD_DIR)
