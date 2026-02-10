#include "ipc_methods.hpp"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>
#include <string>

typedef bool (*RunFn)(const Config&, Result&);

struct Method {
    const char *name;
    RunFn fn;
};

static unsigned long long parse_size(const char *s) {
    if (!s || !*s) return 0;
    char *end = 0;
    unsigned long long base = std::strtoull(s, &end, 10);
    if (!end || *end == '\0') return base;
    if ((end[0] == 'k' || end[0] == 'K') && end[1] == '\0') return base * 1024ULL;
    if ((end[0] == 'm' || end[0] == 'M') && end[1] == '\0') return base * 1024ULL * 1024ULL;
    if ((end[0] == 'g' || end[0] == 'G') && end[1] == '\0') return base * 1024ULL * 1024ULL * 1024ULL;
    return 0;
}

static void usage(const char *prog) {
    std::printf("Usage: %s [--method <name|all>] [--file <path>] [--size <N[K|M|G]>] [--chunk <bytes>] [--iterations <N>]\\n", prog);
    std::printf("Methods: shared_memory tcp udp unix_domain message_queue mmap all\\n");
}

static void print_result(const Result &r) {
    std::printf("%-14s | %8.3f s | %10.2f MB/s | correct=%s | reliable=%s", r.ipc_name.c_str(), r.seconds, r.mb_per_sec,
                r.correct ? "yes" : "no", r.reliable ? "yes" : "no");
    if (!r.notes.empty()) {
        std::printf(" | %s", r.notes.c_str());
    }
    std::printf("\\n");
}

int main(int argc, char **argv) {
    Config cfg;
    cfg.file_path = "./ipc_test_1gb.bin";
    cfg.file_size = 1024ULL * 1024ULL * 1024ULL;
    cfg.chunk_size = 64 * 1024;
    cfg.iterations = 1;

    std::string wanted = "all";

    int i;
    for (i = 1; i < argc; ++i) {
        if (std::strcmp(argv[i], "--method") == 0 && i + 1 < argc) {
            wanted = argv[++i];
        } else if (std::strcmp(argv[i], "--file") == 0 && i + 1 < argc) {
            cfg.file_path = argv[++i];
        } else if (std::strcmp(argv[i], "--size") == 0 && i + 1 < argc) {
            unsigned long long s = parse_size(argv[++i]);
            if (s == 0) {
                usage(argv[0]);
                return 1;
            }
            cfg.file_size = s;
        } else if (std::strcmp(argv[i], "--chunk") == 0 && i + 1 < argc) {
            cfg.chunk_size = (size_t)std::strtoul(argv[++i], 0, 10);
            if (cfg.chunk_size == 0) {
                usage(argv[0]);
                return 1;
            }
        } else if (std::strcmp(argv[i], "--iterations") == 0 && i + 1 < argc) {
            cfg.iterations = std::atoi(argv[++i]);
            if (cfg.iterations <= 0) {
                usage(argv[0]);
                return 1;
            }
        } else if (std::strcmp(argv[i], "--help") == 0 || std::strcmp(argv[i], "-h") == 0) {
            usage(argv[0]);
            return 0;
        } else {
            usage(argv[0]);
            return 1;
        }
    }

    std::string err;
    std::printf("Preparing test file: %s (%llu bytes)\\n", cfg.file_path.c_str(), cfg.file_size);
    if (!ensure_test_file(cfg.file_path, cfg.file_size, err)) {
        std::fprintf(stderr, "error: %s\\n", err.c_str());
        return 1;
    }

    Method methods[] = {
        {"shared_memory", run_shared_memory},
        {"tcp", run_tcp},
        {"udp", run_udp},
        {"unix_domain", run_unix_domain},
        {"message_queue", run_message_queue},
        {"mmap", run_mmap}
    };
    const int method_count = (int)(sizeof(methods) / sizeof(methods[0]));

    std::vector<Method> selected;
    if (wanted == "all") {
        for (i = 0; i < method_count; ++i) selected.push_back(methods[i]);
    } else {
        for (i = 0; i < method_count; ++i) {
            if (wanted == methods[i].name) {
                selected.push_back(methods[i]);
                break;
            }
        }
        if (selected.empty()) {
            std::fprintf(stderr, "unknown method: %s\\n", wanted.c_str());
            usage(argv[0]);
            return 1;
        }
    }

    std::printf("\\nResults:\\n");
    std::printf("IPC            |    time s |      MB/s | correctness | reliability\\n");
    std::printf("---------------------------------------------------------------------\\n");

    for (size_t m = 0; m < selected.size(); ++m) {
        double sec_sum = 0.0;
        double mbps_sum = 0.0;
        int ok_correct = 0;
        int ok_reliable = 0;
        Result last;
        init_result(last, selected[m].name);

        for (int it = 0; it < cfg.iterations; ++it) {
            Result r;
            if (!selected[m].fn(cfg, r)) {
                last = r;
                break;
            }
            sec_sum += r.seconds;
            mbps_sum += r.mb_per_sec;
            if (r.correct) ok_correct++;
            if (r.reliable) ok_reliable++;
            last = r;
        }

        if (last.seconds > 0.0) {
            last.seconds = sec_sum / (double)cfg.iterations;
            last.mb_per_sec = mbps_sum / (double)cfg.iterations;
            last.correct = (ok_correct == cfg.iterations);
            last.reliable = (ok_reliable == cfg.iterations);
        }
        print_result(last);
    }

    return 0;
}
