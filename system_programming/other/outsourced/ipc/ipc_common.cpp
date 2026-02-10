#include "ipc_common.hpp"

#include <sys/stat.h>
#include <sys/time.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <fcntl.h>
#include <cerrno>
#include <cstdio>
#include <cstring>

static const unsigned long long FNV_OFFSET_BASIS = 1469598103934665603ULL;
static const unsigned long long FNV_PRIME = 1099511628211ULL;

double now_seconds() {
    struct timeval tv;
    gettimeofday(&tv, 0);
    return (double)tv.tv_sec + (double)tv.tv_usec / 1000000.0;
}

unsigned long long fnv1a_update(unsigned long long seed, const char *data, size_t len) {
    unsigned long long h = seed == 0 ? FNV_OFFSET_BASIS : seed;
    size_t i;
    for (i = 0; i < len; ++i) {
        h ^= (unsigned char)data[i];
        h *= FNV_PRIME;
    }
    return h;
}

unsigned long long file_size_bytes(const std::string &path) {
    struct stat st;
    if (stat(path.c_str(), &st) != 0) {
        return 0;
    }
    return (unsigned long long)st.st_size;
}

bool ensure_test_file(const std::string &path, unsigned long long size_bytes, std::string &err) {
    unsigned long long existing = file_size_bytes(path);
    if (existing == size_bytes && existing > 0) {
        return true;
    }

    int fd = open(path.c_str(), O_CREAT | O_TRUNC | O_WRONLY, 0644);
    if (fd < 0) {
        err = std::string("failed to open test file: ") + std::strerror(errno);
        return false;
    }

    const size_t block_size = 64 * 1024;
    char block[64 * 1024];
    size_t i;
    for (i = 0; i < block_size; ++i) {
        block[i] = (char)(i & 0xFF);
    }

    unsigned long long written = 0;
    while (written < size_bytes) {
        size_t to_write = block_size;
        if (size_bytes - written < to_write) {
            to_write = (size_t)(size_bytes - written);
        }
        ssize_t w = write(fd, block, to_write);
        if (w <= 0) {
            err = std::string("failed while writing test file: ") + std::strerror(errno);
            close(fd);
            return false;
        }
        written += (unsigned long long)w;
    }

    if (close(fd) != 0) {
        err = std::string("failed to close test file: ") + std::strerror(errno);
        return false;
    }
    return true;
}

void init_result(Result &r, const std::string &name) {
    r = Result();
    r.ipc_name = name;
}

unsigned long long htonll_u64(unsigned long long x) {
    unsigned int hi = (unsigned int)(x >> 32);
    unsigned int lo = (unsigned int)(x & 0xFFFFFFFFULL);
    unsigned long long n_hi = (unsigned long long)htonl(hi);
    unsigned long long n_lo = (unsigned long long)htonl(lo);
    return (n_lo << 32) | n_hi;
}

unsigned long long ntohll_u64(unsigned long long x) {
    return htonll_u64(x);
}

bool send_all(int fd, const char *buf, size_t len) {
    size_t sent = 0;
    while (sent < len) {
        ssize_t rc = write(fd, buf + sent, len - sent);
        if (rc < 0) {
            if (errno == EINTR) {
                continue;
            }
            return false;
        }
        if (rc == 0) {
            return false;
        }
        sent += (size_t)rc;
    }
    return true;
}

bool recv_all(int fd, char *buf, size_t len) {
    size_t recvd = 0;
    while (recvd < len) {
        ssize_t rc = read(fd, buf + recvd, len - recvd);
        if (rc < 0) {
            if (errno == EINTR) {
                continue;
            }
            return false;
        }
        if (rc == 0) {
            return false;
        }
        recvd += (size_t)rc;
    }
    return true;
}
