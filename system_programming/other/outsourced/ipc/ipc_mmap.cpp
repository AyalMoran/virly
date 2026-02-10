#include "ipc_methods.hpp"

#include <sys/mman.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <fcntl.h>
#include <unistd.h>
#include <cerrno>
#include <cstdio>
#include <cstring>

struct ChildReport {
    unsigned long long bytes;
    unsigned long long checksum;
    int protocol_ok;
};

bool run_mmap(const Config &cfg, Result &res) {
    init_result(res, "mmap_file");

    int fd = open(cfg.file_path.c_str(), O_RDONLY);
    if (fd < 0) {
        res.notes = "open input failed";
        return false;
    }

    void *mem = mmap(0, (size_t)cfg.file_size, PROT_READ, MAP_PRIVATE, fd, 0);
    if (mem == MAP_FAILED) {
        close(fd);
        res.notes = std::string("mmap failed: ") + std::strerror(errno);
        return false;
    }

    unsigned long long sender_checksum = fnv1a_update(0, (const char*)mem, (size_t)cfg.file_size);

    int pipefd[2];
    if (pipe(pipefd) != 0) {
        munmap(mem, (size_t)cfg.file_size);
        close(fd);
        res.notes = "pipe failed";
        return false;
    }

    pid_t pid = fork();
    if (pid < 0) {
        close(pipefd[0]);
        close(pipefd[1]);
        munmap(mem, (size_t)cfg.file_size);
        close(fd);
        res.notes = "fork failed";
        return false;
    }

    if (pid == 0) {
        close(pipefd[0]);

        unsigned long long receiver_checksum = fnv1a_update(0, (const char*)mem, (size_t)cfg.file_size);

        ChildReport rep;
        rep.bytes = cfg.file_size;
        rep.checksum = receiver_checksum;
        rep.protocol_ok = (receiver_checksum == sender_checksum) ? 1 : 0;

        (void)write(pipefd[1], &rep, sizeof(rep));
        close(pipefd[1]);

        munmap(mem, (size_t)cfg.file_size);
        close(fd);
        _exit(rep.protocol_ok ? 0 : 2);
    }

    close(pipefd[1]);
    double t0 = now_seconds();

    ChildReport rep;
    std::memset(&rep, 0, sizeof(rep));
    (void)read(pipefd[0], &rep, sizeof(rep));
    close(pipefd[0]);

    int status = 0;
    waitpid(pid, &status, 0);
    double t1 = now_seconds();

    munmap(mem, (size_t)cfg.file_size);
    close(fd);

    res.seconds = t1 - t0;
    res.bytes_sent = cfg.file_size;
    res.bytes_received = rep.bytes;
    res.sender_checksum = sender_checksum;
    res.receiver_checksum = rep.checksum;
    res.correct = (rep.protocol_ok == 1);
    res.reliable = res.correct;
    if (res.seconds > 0.0) {
        res.mb_per_sec = (double)cfg.file_size / (1024.0 * 1024.0) / res.seconds;
    }
    if (!res.correct) {
        res.notes = "checksum mismatch";
    }

    return true;
}
