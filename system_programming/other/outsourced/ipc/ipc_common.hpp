#ifndef IPC_COMMON_HPP
#define IPC_COMMON_HPP

#include <string>
#include <vector>

struct Config {
    std::string file_path;
    unsigned long long file_size;
    size_t chunk_size;
    int iterations;
};

struct Result {
    std::string ipc_name;
    double seconds;
    double mb_per_sec;
    bool correct;
    bool reliable;
    unsigned long long bytes_sent;
    unsigned long long bytes_received;
    unsigned long long sender_checksum;
    unsigned long long receiver_checksum;
    std::string notes;

    Result() : seconds(0.0), mb_per_sec(0.0), correct(false), reliable(false), bytes_sent(0), bytes_received(0), sender_checksum(0), receiver_checksum(0) {}
};

double now_seconds();
unsigned long long fnv1a_update(unsigned long long seed, const char *data, size_t len);
unsigned long long file_size_bytes(const std::string &path);
bool ensure_test_file(const std::string &path, unsigned long long size_bytes, std::string &err);
void init_result(Result &r, const std::string &name);

unsigned long long htonll_u64(unsigned long long x);
unsigned long long ntohll_u64(unsigned long long x);

bool send_all(int fd, const char *buf, size_t len);
bool recv_all(int fd, char *buf, size_t len);

#endif
