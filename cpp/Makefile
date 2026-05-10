SHELL := /bin/bash

.DEFAULT_GOAL := all

CXX ?= g++
CC ?= gcc
CXXSTD ?= c++20
CXXFLAGS ?= -Wall -Wextra -Wpedantic -O2 -Weffc++ -Werror
CFLAGS ?= -Wall -Wextra -Wpedantic -O2
CPPFLAGS ?=
LDFLAGS ?=
LDLIBS ?=


BIN_DIR := bin
BUILD_DIR := build

CPPFLAGS += -Iinclude

ALL_SRCS := $(shell find . -type f \
	\( -name '*.cpp' -o -name '*.cc' -o -name '*.cxx' -o -name '*.C' -o -name '*.c' \) \
	-not -path './$(BUILD_DIR)/*' -not -path './$(BIN_DIR)/*' | sed 's|^\./||' | sort)

MAIN_SRCS := $(shell for f in $(ALL_SRCS); do \
	if awk '/^[[:space:]]*int[[:space:]]+main[[:space:]]*/ { found = 1; exit } END { exit !found }' "$$f"; then echo "$$f"; fi; \
	done | sort)
DEFAULT_MAIN_SRCS := $(filter src/% test/%,$(MAIN_SRCS))
BUILD_MAIN_SRCS := $(if $(filter 1 yes true,$(INCLUDE_OTHER)),$(MAIN_SRCS),$(DEFAULT_MAIN_SRCS))

LIB_SRCS := $(filter-out $(MAIN_SRCS),$(ALL_SRCS))

TEST_UTILS_USERS := $(shell grep -R -E -l \
	-e 'test_utils.h"' \
	-e 'test_utils.hpp"' \
	test shapes/test 2>/dev/null | sed 's|^\./||' | sort)
TEST_UTILS_SRC := ../utils/src/test_utils.cpp

ifneq ($(strip $(TEST_UTILS_USERS)),)
CPPFLAGS += -I../utils/inc
endif

sanitize = $(subst -,_,$(subst .,_,$(subst /,_,$(1))))
bin_name = $(subst /,_,$(basename $(1)))
main_dir = $(patsubst %/,%,$(dir $(1)))
test_file_base = $(basename $(notdir $(1)))
test_selector = $(patsubst %Test,%,$(call test_file_base,$(1)))
build_selector = $(call bin_name,$(1))

bin_name = $(if $(filter test/% ,$(1)),$(call test_file_base,$(1)),$(subst /,_,$(basename $(1))))

src_to_obj = $(if $(filter ../%,$(1)),$(BUILD_DIR)/external/$(patsubst ../%,%,$(1)).o,$(BUILD_DIR)/$(1).o)
src_to_dep = $(patsubst %.o,%.d,$(call src_to_obj,$(1)))

needs_test_utils = $(filter $(1),$(TEST_UTILS_USERS))
test_module_sources = $(wildcard src/$(call test_selector,$(1)).cpp) $(TEST_EXTRA_SRCS_$(call test_selector,$(1)))

TEST_EXTRA_SRCS_PriorityQueue := src/WaitableQueue.cpp
TEST_EXTRA_SRCS_AsyncInjection := src/Scheduler.cpp
TEST_EXTRA_SRCS_DirMonitor := src/DllLoader.cpp
TEST_EXTRA_SRCS_ThreadPool := src/Pauser.cpp src/PriorityQueue.cpp src/ThreadMap.cpp src/ThreadPool.cpp src/ThreadPoolTasks.cpp src/WaitableQueue.cpp
TEST_EXTRA_SRCS_WaitableQueue := src/PriorityQueue.cpp

define module_lib_sources
$(if $(filter test/%,$(1)),$(strip $(call test_module_sources,$(1))),)
endef

define sources_for_main
$(sort $(1) $(call module_lib_sources,$(1)) $(if $(call needs_test_utils,$(1)),$(TEST_UTILS_SRC),))
endef



BINARY_TARGETS :=
TEST_BINARY_TARGETS :=

BINARY_TARGETS := $(foreach m,$(BUILD_MAIN_SRCS),$(BIN_DIR)/$(call bin_name,$(m)))
TEST_MAIN_SRCS := $(filter test/% ,$(MAIN_SRCS))
TEST_BINARY_TARGETS := $(foreach m,$(TEST_MAIN_SRCS),$(BIN_DIR)/$(call bin_name,$(m)))
TEST_SELECTORS := $(sort $(foreach t,$(filter %Test.cpp,$(TEST_MAIN_SRCS)),$(call test_selector,$(t))))
COMPILE_TIME_RAND ?= $(shell printf '%s' $$(( $$(date +%s%N) % 2048 + 64 )))
NPROD ?= 2
CONS ?= 2
export COMPILE_TIME_RAND NPROD CONS
TESTS_CPPFLAGS := -DCOMPILE_TIME_RAND=$(COMPILE_TIME_RAND) -DNPROD=$(NPROD) -DCONS=$(CONS)
BUILD_SELECTORS := $(sort $(foreach m,$(BUILD_MAIN_SRCS),$(call build_selector,$(m))) \
	$(foreach t,$(filter %Test.cpp,$(TEST_MAIN_SRCS)),$(call test_selector,$(t))))

# Link each discovered main() to its resolved object list.
define REGISTER_BINARY
SRCS_$(2) := $(call sources_for_main,$(1))
$(BIN_DIR)/$(call bin_name,$(1)): $(foreach s,$(call sources_for_main,$(1)),$(call src_to_obj,$(s))) | $(BIN_DIR)
	@mkdir -p $$(@D)
	$(if $(filter %.cpp %.cc %.cxx %.C,$(call sources_for_main,$(1))),$(CXX),$(CC)) $(LDFLAGS) $$^ $(LDLIBS) -o $$@
$(if $(filter test/ScopeLockTest.cpp test/MutexTest.cpp,$(1)),$(BIN_DIR)/$(call bin_name,$(1)): LDLIBS += -pthread,)
endef

$(foreach m,$(MAIN_SRCS),$(eval $(call REGISTER_BINARY,$(m),$(call sanitize,$(m)))))
$(foreach m,$(BUILD_MAIN_SRCS),$(eval SELECT_BIN_$(call build_selector,$(m)) := $(BIN_DIR)/$(call bin_name,$(m))))
$(foreach t,$(filter %Test.cpp,$(TEST_MAIN_SRCS)),$(eval SELECT_BIN_$(call test_selector,$(t)) := $(BIN_DIR)/$(call bin_name,$(t))))

ALL_BUILD_SRCS := $(sort $(LIB_SRCS) $(MAIN_SRCS) $(if $(strip $(TEST_UTILS_USERS)),$(TEST_UTILS_SRC),))
DEPFILES := $(foreach s,$(ALL_BUILD_SRCS),$(call src_to_dep,$(s)))

.PHONY: all build list run clean help prep $(BUILD_SELECTORS)

all: prep
	@built=0; failed=0; skipped=0; failed_list=""; \
	for bin in $(BINARY_TARGETS); do \
		if $(MAKE) --no-print-directory "$$bin"; then \
			built=$$((built + 1)); \
		else \
			failed=$$((failed + 1)); \
			failed_list="$$failed_list $$bin"; \
		fi; \
	done; \
	echo "Built: $$built"; \
	echo "Failed: $$failed"; \
	echo "Skipped: $$skipped"; \
	if [ $$failed -ne 0 ]; then \
		echo "Failed targets:$$failed_list"; \
			exit 1; \
	fi

build: prep
	@if [ -n "$(strip $(UNKNOWN_BUILD_SELECTORS))" ]; then \
		echo "Unknown build selector(s): $(UNKNOWN_BUILD_SELECTORS)"; \
		echo "Available selectors: $(BUILD_SELECTORS)"; \
		exit 2; \
	fi
	@built=0; failed=0; skipped=0; failed_list=""; \
	for bin in $(BUILD_BINARY_TARGETS); do \
		if $(MAKE) --no-print-directory "$$bin"; then \
			built=$$((built + 1)); \
		else \
			failed=$$((failed + 1)); \
			failed_list="$$failed_list $$bin"; \
		fi; \
	done; \
	echo "Built: $$built"; \
	echo "Failed: $$failed"; \
	echo "Skipped: $$skipped"; \
	if [ $$failed -ne 0 ]; then \
		echo "Failed targets:$$failed_list"; \
		exit 1; \
	fi

list:
	@echo "Default build sources and binaries:";
	@$(foreach s,$(BUILD_MAIN_SRCS),printf '  %s -> %s/%s\n' "$(s)" "$(BIN_DIR)" "$(call bin_name,$(s))";)
	@echo "";
	@echo "Build selectors:";
	@$(foreach s,$(BUILD_SELECTORS),printf '  %s\n' "$(s)";)

run: prep
	@if [ -n "$(strip $(UNKNOWN_BUILD_SELECTORS))" ]; then \
		echo "Unknown run selector(s): $(UNKNOWN_BUILD_SELECTORS)"; \
		echo "Available selectors: $(BUILD_SELECTORS)"; \
		exit 2; \
	fi
	@build_failed=0; failed_build_list=""; \
	for bin in $(RUN_BINARY_TARGETS); do \
		if ! $(MAKE) --no-print-directory "$$bin"; then \
			build_failed=$$((build_failed + 1)); \
			failed_build_list="$$failed_build_list $$bin"; \
		fi; \
	done; \
	if [ $$build_failed -ne 0 ]; then \
		echo "Build failures: $$failed_build_list"; \
		exit 1; \
	fi
	@ran=0; failed=0; skipped=0; failed_list=""; \
	for bin in $(RUN_BINARY_TARGETS); do \
		if [ -x "$$bin" ]; then \
			echo "[RUN] $$bin"; \
			if "$$bin"; then \
				ran=$$((ran + 1)); \
			else \
				failed=$$((failed + 1)); \
				failed_list="$$failed_list $$bin"; \
			fi; \
		else \
			skipped=$$((skipped + 1)); \
		fi; \
	done; \
	echo "Ran: $$ran"; \
	echo "Failed: $$failed"; \
	echo "Skipped: $$skipped"; \
	if [ $$failed -ne 0 ]; then \
		echo "Failing tests:$$failed_list"; \
		exit 1; \
	fi

clean:
	@rm -rf $(BUILD_DIR)
	@if [ -d "$(BIN_DIR)" ]; then find "$(BIN_DIR)" -mindepth 1 -delete; fi

help:
	@echo "Targets:";
	@echo "  all   - build all discovered executables (best-effort)";
	@echo "  build - build selected targets; use selectors: make build RCString src_histo";
	@echo "  list  - list default build targets and available selectors";
	@echo "  run   - build and run selected targets; defaults to test targets";
	@echo "          use selectors: make run RCString ScopeLockTest";
	@echo "  clean - remove build artifacts and generated binaries";
	@echo "";
	@echo "Overridable vars:";
	@echo "  CXX, CC, CXXSTD, CXXFLAGS, CFLAGS, CPPFLAGS, LDFLAGS, LDLIBS";
	@echo "  INCLUDE_OTHER=1 to include ./other demo targets in plain make";
	@echo "  Example: make CXX=clang++ CXXSTD=c++20"

prep:
	@mkdir -p $(BIN_DIR) $(BUILD_DIR)

# Selector goals are treated as target names for build/run.
$(TEST_SELECTORS):
	@:

$(BUILD_DIR)/%.cpp.o: %.cpp
	@mkdir -p $(dir $@)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) -std=$(CXXSTD) -MMD -MP -c $< -o $@

$(BUILD_DIR)/%.cc.o: %.cc
	@mkdir -p $(dir $@)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) -std=$(CXXSTD) -MMD -MP -c $< -o $@

$(BUILD_DIR)/%.cxx.o: %.cxx
	@mkdir -p $(dir $@)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) -std=$(CXXSTD) -MMD -MP -c $< -o $@

$(BUILD_DIR)/%.C.o: %.C
	@mkdir -p $(dir $@)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) -std=$(CXXSTD) -MMD -MP -c $< -o $@

$(BUILD_DIR)/%.c.o: %.c
	@mkdir -p $(dir $@)
	$(CC) $(CPPFLAGS) $(CFLAGS) -MMD -MP -c $< -o $@

$(BUILD_DIR)/external/%.cpp.o: ../%.cpp
	@mkdir -p $(dir $@)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) -std=$(CXXSTD) -MMD -MP -c $< -o $@

$(BUILD_DIR)/external/%.cc.o: ../%.cc
	@mkdir -p $(dir $@)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) -std=$(CXXSTD) -MMD -MP -c $< -o $@

$(BUILD_DIR)/external/%.cxx.o: ../%.cxx
	@mkdir -p $(dir $@)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) -std=$(CXXSTD) -MMD -MP -c $< -o $@

$(BUILD_DIR)/external/%.C.o: ../%.C
	@mkdir -p $(dir $@)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) -std=$(CXXSTD) -MMD -MP -c $< -o $@

$(BUILD_DIR)/external/%.c.o: ../%.c
	@mkdir -p $(dir $@)
	$(CC) $(CPPFLAGS) $(CFLAGS) -MMD -MP -c $< -o $@

# Test-only defines stay off shared src/ objects.
$(BUILD_DIR)/test/%.cpp.o: CPPFLAGS += $(TESTS_CPPFLAGS)
$(BUILD_DIR)/external/utils/src/test_utils.cpp.o: CPPFLAGS += $(TESTS_CPPFLAGS)
$(call src_to_obj,test/ScopeLockTest.cpp): CXXFLAGS += -pthread
$(call src_to_obj,src/DirMonitor.cpp): CXXFLAGS += -pthread
$(call src_to_obj,test/DirMonitorTest.cpp): CXXFLAGS += -pthread
$(BIN_DIR)/DirMonitorTest: LDLIBS += -ldl -pthread
$(BIN_DIR)/DllLoaderTest: LDLIBS += -ldl

-include $(DEPFILES)

SELECTOR_GOALS := $(filter-out all build list run clean help prep,$(MAKECMDGOALS))
KNOWN_BUILD_SELECTORS := $(filter $(BUILD_SELECTORS),$(SELECTOR_GOALS))
UNKNOWN_BUILD_SELECTORS := $(filter-out $(BUILD_SELECTORS),$(SELECTOR_GOALS))
BUILD_BINARY_TARGETS := $(if $(strip $(SELECTOR_GOALS)),$(foreach s,$(KNOWN_BUILD_SELECTORS),$(SELECT_BIN_$(s))),$(BINARY_TARGETS))
RUN_BINARY_TARGETS := $(if $(strip $(SELECTOR_GOALS)),$(foreach s,$(KNOWN_BUILD_SELECTORS),$(SELECT_BIN_$(s))),$(TEST_BINARY_TARGETS))

ifneq ($(filter build run,$(MAKECMDGOALS)),)
%:
	@:
endif
