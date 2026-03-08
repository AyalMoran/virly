SHELL := /bin/bash

.DEFAULT_GOAL := all

CXX ?= g++
CC ?= gcc
CXXSTD ?= c++17
CXXFLAGS ?= -Wall -Wextra -Wpedantic -O2 -Weffc++ -Werror
CFLAGS ?= -Wall -Wextra -Wpedantic -O2
CPPFLAGS ?=
LDFLAGS ?=
LDLIBS ?=

BIN_DIR := bin
BUILD_DIR := build

CPPFLAGS += -Iinclude -Ishapes/inc

ALL_SRCS := $(shell find . -type f \
	\( -name '*.cpp' -o -name '*.cc' -o -name '*.cxx' -o -name '*.C' -o -name '*.c' \) \
	-not -path './$(BUILD_DIR)/*' -not -path './$(BIN_DIR)/*' | sed 's|^\./||' | sort)

MAIN_SRCS := $(shell for f in $(ALL_SRCS); do \
	if awk '/^[[:space:]]*int[[:space:]]+main[[:space:]]*/ { found = 1; exit } END { exit !found }' "$$f"; then echo "$$f"; fi; \
	done | sort)

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

bin_name = $(if $(filter test/% shapes/test/%,$(1)),$(call test_file_base,$(1)),$(subst /,_,$(basename $(1))))

src_to_obj = $(if $(filter ../%,$(1)),$(BUILD_DIR)/external/$(patsubst ../%,%,$(1)).o,$(BUILD_DIR)/$(1).o)
src_to_dep = $(patsubst %.o,%.d,$(call src_to_obj,$(1)))

needs_test_utils = $(filter $(1),$(TEST_UTILS_USERS))

define module_lib_sources
$(if $(filter test/%,$(1)),$(filter src/%,$(LIB_SRCS)),\
$(if $(filter shapes/test/%,$(1)),$(filter shapes/src/%,$(LIB_SRCS)),\
$(if $(filter other/%,$(1)),$(filter $(call main_dir,$(1))/%,$(LIB_SRCS)),\
$(if $(filter src/%,$(1)),$(filter src/%,$(LIB_SRCS)),))))
endef

define sources_for_main
$(sort $(1) $(call module_lib_sources,$(1)) $(if $(call needs_test_utils,$(1)),$(TEST_UTILS_SRC),))
endef

BINARY_TARGETS :=
TEST_BINARY_TARGETS :=

BINARY_TARGETS := $(foreach m,$(MAIN_SRCS),$(BIN_DIR)/$(call bin_name,$(m)))
TEST_MAIN_SRCS := $(filter test/% shapes/test/%,$(MAIN_SRCS))
TEST_BINARY_TARGETS := $(foreach m,$(TEST_MAIN_SRCS),$(BIN_DIR)/$(call bin_name,$(m)))
TEST_SELECTORS := $(sort $(foreach t,$(filter %Test.cpp,$(TEST_MAIN_SRCS)),$(call test_selector,$(t))))

# Register one explicit link target per discovered main() source.
define REGISTER_BINARY
SRCS_$(2) := $(call sources_for_main,$(1))
$(BIN_DIR)/$(call bin_name,$(1)): $(foreach s,$(call sources_for_main,$(1)),$(call src_to_obj,$(s))) | $(BIN_DIR)
	@mkdir -p $$(@D)
	$(if $(filter %.cpp %.cc %.cxx %.C,$(call sources_for_main,$(1))),$(CXX),$(CC)) $(LDFLAGS) $$^ $(LDLIBS) -o $$@
$(if $(filter test/ScopeLockTest.cpp,$(1)),$(BIN_DIR)/$(call bin_name,$(1)): LDLIBS += -pthread,)
endef

$(foreach m,$(MAIN_SRCS),$(eval $(call REGISTER_BINARY,$(m),$(call sanitize,$(m)))))
$(foreach t,$(filter %Test.cpp,$(TEST_MAIN_SRCS)),$(eval SELECT_BIN_$(call test_selector,$(t)) := $(BIN_DIR)/$(call bin_name,$(t))))

ALL_BUILD_SRCS := $(sort $(LIB_SRCS) $(MAIN_SRCS) $(if $(strip $(TEST_UTILS_USERS)),$(TEST_UTILS_SRC),))
DEPFILES := $(foreach s,$(ALL_BUILD_SRCS),$(call src_to_dep,$(s)))

.PHONY: all list run clean help prep $(TEST_SELECTORS)

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

list:
	@echo "Discovered main sources and binaries:";
	@$(foreach s,$(MAIN_SRCS),printf '  %s -> %s/%s\n' "$(s)" "$(BIN_DIR)" "$(call bin_name,$(s))";)

run: prep
	@if [ -n "$(strip $(UNKNOWN_RUN_SELECTORS))" ]; then \
		echo "Unknown test selector(s): $(UNKNOWN_RUN_SELECTORS)"; \
		echo "Available selectors: $(TEST_SELECTORS)"; \
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
	@echo "  list  - list discovered executable targets";
	@echo "  run   - build and run discovered tests under test/ and shapes/test/";
	@echo "          use selectors: make run RCString";
	@echo "  clean - remove build artifacts and generated binaries";
	@echo "";
	@echo "Overridable vars:";
	@echo "  CXX, CC, CXXSTD, CXXFLAGS, CFLAGS, CPPFLAGS, LDFLAGS, LDLIBS";
	@echo "  Example: make CXX=clang++ CXXSTD=c++20"

prep:
	@mkdir -p $(BIN_DIR) $(BUILD_DIR)

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

$(call src_to_obj,test/ScopeLockTest.cpp): CXXFLAGS += -pthread

-include $(DEPFILES)

RUN_SELECTORS := $(filter-out run,$(MAKECMDGOALS))
KNOWN_RUN_SELECTORS := $(filter $(TEST_SELECTORS),$(RUN_SELECTORS))
UNKNOWN_RUN_SELECTORS := $(filter-out $(TEST_SELECTORS),$(RUN_SELECTORS))
RUN_BINARY_TARGETS := $(if $(strip $(RUN_SELECTORS)),$(foreach s,$(KNOWN_RUN_SELECTORS),$(SELECT_BIN_$(s))),$(TEST_BINARY_TARGETS))

ifneq ($(filter run,$(MAKECMDGOALS)),)
%:
	@:
endif
