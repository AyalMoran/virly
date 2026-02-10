#ifndef IPC_METHODS_HPP
#define IPC_METHODS_HPP

#include "ipc_common.hpp"

bool run_shared_memory(const Config &cfg, Result &res);
bool run_tcp(const Config &cfg, Result &res);
bool run_udp(const Config &cfg, Result &res);
bool run_unix_domain(const Config &cfg, Result &res);
bool run_message_queue(const Config &cfg, Result &res);
bool run_mmap(const Config &cfg, Result &res);

#endif
