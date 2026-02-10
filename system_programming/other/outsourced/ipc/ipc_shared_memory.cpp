#include "ipc_methods.hpp"

#include <sys/mman.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <fcntl.h>
#include <semaphore.h>
#include <unistd.h>
#include <cerrno>
#include <cstdio>
#include <cstring>
#include <vector>

struct ShmBlock {
    volatile int done;
    volatile int ready;
    volatile size_t data_len;
    unsigned long long total_size;
    unsigned long long checksum;
    char data[1];
};

struct ChildReport {
    unsigned long long bytes;
    unsigned long long checksum;
    int protocol_ok;
};

bool run_shared_memory(const Config &cfg, Result &res) {
    init_result(res, "shared_memory");

    size_t payload = cfg.chunk_size;
    if (payload < 1024) {
        payload = 1024;
    }

    char shm_name[128];
    char sem_empty_name[128];
    char sem_full_name[128];
    std::snprintf(shm_name, sizeof(shm_name), "/ipc_shm_%d", (int)getpid());
    std::snprintf(sem_empty_name, sizeof(sem_empty_name), "/ipc_sem_e_%d", (int)getpid());
    std::snprintf(sem_full_name, sizeof(sem_full_name), "/ipc_sem_f_%d", (int)getpid());

    shm_unlink(shm_name);
    sem_unlink(sem_empty_name);
    sem_unlink(sem_full_name);

    int shm_fd = shm_open(shm_name, O_CREAT | O_RDWR, 0600);
    if (shm_fd < 0) {
        res.notes = std::string("shm_open failed: ") + std::strerror(errno);
        return false;
    }

    size_t shm_size = sizeof(ShmBlock) + payload;
    if (ftruncate(shm_fd, (off_t)shm_size) != 0) {
        close(shm_fd);
        shm_unlink(shm_name);
        res.notes = "ftruncate failed";
        return false;
    }

    void *mem = mmap(0, shm_size, PROT_READ | PROT_WRITE, MAP_SHARED, shm_fd, 0);
    if (mem == MAP_FAILED) {
        close(shm_fd);
        shm_unlink(shm_name);
        res.notes = std::string("mmap failed: ") + std::strerror(errno);
        return false;
    }

    ShmBlock *blk = (ShmBlock*)mem;
    blk->done = 0;
    blk->ready = 0;
    blk->data_len = 0;
    blk->total_size = 0;
    blk->checksum = 0;

    sem_t *sem_empty = sem_open(sem_empty_name, O_CREAT, 0600, 1);
    sem_t *sem_full = sem_open(sem_full_name, O_CREAT, 0600, 0);
    if (sem_empty == SEM_FAILED || sem_full == SEM_FAILED) {
        munmap(mem, shm_size);
        close(shm_fd);
        shm_unlink(shm_name);
        if (sem_empty != SEM_FAILED) sem_close(sem_empty);
        if (sem_full != SEM_FAILED) sem_close(sem_full);
        sem_unlink(sem_empty_name);
        sem_unlink(sem_full_name);
        res.notes = "sem_open failed";
        return false;
    }

    int pipefd[2];
    if (pipe(pipefd) != 0) {
        sem_close(sem_empty);
        sem_close(sem_full);
        sem_unlink(sem_empty_name);
        sem_unlink(sem_full_name);
        munmap(mem, shm_size);
        close(shm_fd);
        shm_unlink(shm_name);
        res.notes = "pipe failed";
        return false;
    }

    pid_t pid = fork();
    if (pid < 0) {
        close(pipefd[0]);
        close(pipefd[1]);
        sem_close(sem_empty);
        sem_close(sem_full);
        sem_unlink(sem_empty_name);
        sem_unlink(sem_full_name);
        munmap(mem, shm_size);
        close(shm_fd);
        shm_unlink(shm_name);
        res.notes = "fork failed";
        return false;
    }

    if (pid == 0) {
        close(pipefd[0]);

        ChildReport rep;
        rep.bytes = 0;
        rep.checksum = 0;
        rep.protocol_ok = 0;

        unsigned long long expected_size = 0;
        unsigned long long expected_checksum = 0;

        while (1) {
            if (sem_wait(sem_full) != 0) {
                if (errno == EINTR) continue;
                break;
            }

            if (!blk->ready) {
                sem_post(sem_empty);
                continue;
            }

            if (blk->done) {
                expected_size = blk->total_size;
                expected_checksum = blk->checksum;
                blk->ready = 0;
                sem_post(sem_empty);
                break;
            }

            rep.bytes += (unsigned long long)blk->data_len;
            rep.checksum = fnv1a_update(rep.checksum, blk->data, blk->data_len);
            blk->ready = 0;
            sem_post(sem_empty);
        }

        rep.protocol_ok = (rep.bytes == expected_size && rep.checksum == expected_checksum) ? 1 : 0;

        (void)write(pipefd[1], &rep, sizeof(rep));
        close(pipefd[1]);

        sem_close(sem_empty);
        sem_close(sem_full);
        munmap(mem, shm_size);
        close(shm_fd);
        _exit(rep.protocol_ok ? 0 : 2);
    }

    close(pipefd[1]);

    int fd = open(cfg.file_path.c_str(), O_RDONLY);
    if (fd < 0) {
        close(pipefd[0]);
        sem_close(sem_empty);
        sem_close(sem_full);
        sem_unlink(sem_empty_name);
        sem_unlink(sem_full_name);
        munmap(mem, shm_size);
        close(shm_fd);
        shm_unlink(shm_name);
        res.notes = "open input failed";
        return false;
    }

    std::vector<char> chunk(payload);
    unsigned long long total = 0;
    unsigned long long checksum = 0;

    while (1) {
        ssize_t n = read(fd, &chunk[0], chunk.size());
        if (n < 0) {
            if (errno == EINTR) continue;
            close(fd);
            close(pipefd[0]);
            sem_close(sem_empty);
            sem_close(sem_full);
            sem_unlink(sem_empty_name);
            sem_unlink(sem_full_name);
            munmap(mem, shm_size);
            close(shm_fd);
            shm_unlink(shm_name);
            res.notes = "read input failed";
            return false;
        }
        if (n == 0) break;
        total += (unsigned long long)n;
        checksum = fnv1a_update(checksum, &chunk[0], (size_t)n);
    }

    if (lseek(fd, 0, SEEK_SET) < 0) {
        close(fd);
        close(pipefd[0]);
        sem_close(sem_empty);
        sem_close(sem_full);
        sem_unlink(sem_empty_name);
        sem_unlink(sem_full_name);
        munmap(mem, shm_size);
        close(shm_fd);
        shm_unlink(shm_name);
        res.notes = "lseek failed";
        return false;
    }

    double t0 = now_seconds();

    while (1) {
        ssize_t n = read(fd, &chunk[0], chunk.size());
        if (n < 0) {
            if (errno == EINTR) continue;
            close(fd);
            close(pipefd[0]);
            sem_close(sem_empty);
            sem_close(sem_full);
            sem_unlink(sem_empty_name);
            sem_unlink(sem_full_name);
            munmap(mem, shm_size);
            close(shm_fd);
            shm_unlink(shm_name);
            res.notes = "read input failed";
            return false;
        }
        if (n == 0) break;

        while (sem_wait(sem_empty) != 0) {
            if (errno != EINTR) {
                close(fd);
                close(pipefd[0]);
                sem_close(sem_empty);
                sem_close(sem_full);
                sem_unlink(sem_empty_name);
                sem_unlink(sem_full_name);
                munmap(mem, shm_size);
                close(shm_fd);
                shm_unlink(shm_name);
                res.notes = "sem_wait empty failed";
                return false;
            }
        }
        std::memcpy(blk->data, &chunk[0], (size_t)n);
        blk->data_len = (size_t)n;
        blk->ready = 1;
        blk->done = 0;
        sem_post(sem_full);
    }

    while (sem_wait(sem_empty) != 0) {
        if (errno != EINTR) {
            close(fd);
            close(pipefd[0]);
            sem_close(sem_empty);
            sem_close(sem_full);
            sem_unlink(sem_empty_name);
            sem_unlink(sem_full_name);
            munmap(mem, shm_size);
            close(shm_fd);
            shm_unlink(shm_name);
            res.notes = "sem_wait end failed";
            return false;
        }
    }
    blk->total_size = cfg.file_size;
    blk->checksum = checksum;
    blk->data_len = 0;
    blk->ready = 1;
    blk->done = 1;
    sem_post(sem_full);

    close(fd);

    ChildReport rep;
    std::memset(&rep, 0, sizeof(rep));
    (void)read(pipefd[0], &rep, sizeof(rep));
    close(pipefd[0]);

    int status = 0;
    waitpid(pid, &status, 0);
    double t1 = now_seconds();

    sem_close(sem_empty);
    sem_close(sem_full);
    sem_unlink(sem_empty_name);
    sem_unlink(sem_full_name);
    munmap(mem, shm_size);
    close(shm_fd);
    shm_unlink(shm_name);

    res.seconds = t1 - t0;
    res.bytes_sent = total;
    res.bytes_received = rep.bytes;
    res.sender_checksum = checksum;
    res.receiver_checksum = rep.checksum;
    res.correct = (rep.protocol_ok == 1);
    res.reliable = res.correct;
    if (res.seconds > 0.0) {
        res.mb_per_sec = (double)total / (1024.0 * 1024.0) / res.seconds;
    }
    if (!res.correct) {
        res.notes = "size/checksum mismatch";
    }

    return true;
}
