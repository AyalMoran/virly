#include "ipc_methods.hpp"

#include <mqueue.h>
#include <sys/wait.h>
#include <unistd.h>
#include <fcntl.h>
#include <cerrno>
#include <cstdio>
#include <cstring>
#include <vector>

struct ChildReport {
    unsigned long long bytes;
    unsigned long long checksum;
    int protocol_ok;
};

bool run_message_queue(const Config &cfg, Result &res) {
    init_result(res, "message_queue");

    size_t payload = cfg.chunk_size;
    if (payload > 4096) {
        payload = 4096;
    }
    if (payload < 64) {
        payload = 64;
    }

    char qname[128];
    std::snprintf(qname, sizeof(qname), "/ipc_mq_%d", (int)getpid());

    struct mq_attr attr;
    std::memset(&attr, 0, sizeof(attr));
    attr.mq_maxmsg = 10;
    attr.mq_msgsize = (long)(payload + 32);

    mq_unlink(qname);
    mqd_t mq = mq_open(qname, O_CREAT | O_RDWR, 0600, &attr);
    if (mq == (mqd_t)-1) {
        res.notes = std::string("mq_open failed: ") + std::strerror(errno);
        return false;
    }

    int pipefd[2];
    if (pipe(pipefd) != 0) {
        mq_close(mq);
        mq_unlink(qname);
        res.notes = "pipe failed";
        return false;
    }

    pid_t pid = fork();
    if (pid < 0) {
        close(pipefd[0]);
        close(pipefd[1]);
        mq_close(mq);
        mq_unlink(qname);
        res.notes = "fork failed";
        return false;
    }

    if (pid == 0) {
        close(pipefd[0]);

        std::vector<char> msg(payload + 32);
        unsigned long long expected_size = 0;
        unsigned long long expected_checksum = 0;
        unsigned long long got = 0;
        unsigned long long checksum = 0;
        int got_start = 0;

        while (1) {
            ssize_t n = mq_receive(mq, &msg[0], msg.size(), 0);
            if (n < 0) {
                if (errno == EINTR) {
                    continue;
                }
                break;
            }
            if (n < 1) {
                continue;
            }

            if (msg[0] == 'S' && n >= 17) {
                unsigned long long sn;
                unsigned long long cn;
                std::memcpy(&sn, &msg[1], sizeof(sn));
                std::memcpy(&cn, &msg[9], sizeof(cn));
                expected_size = ntohll_u64(sn);
                expected_checksum = ntohll_u64(cn);
                got_start = 1;
            } else if (msg[0] == 'D' && got_start) {
                size_t dlen = (size_t)(n - 1);
                got += dlen;
                checksum = fnv1a_update(checksum, &msg[1], dlen);
            } else if (msg[0] == 'E') {
                break;
            }
        }

        ChildReport rep;
        rep.bytes = got;
        rep.checksum = checksum;
        rep.protocol_ok = (got_start && got == expected_size && checksum == expected_checksum) ? 1 : 0;

        (void)write(pipefd[1], &rep, sizeof(rep));
        close(pipefd[1]);
        mq_close(mq);
        _exit(rep.protocol_ok ? 0 : 2);
    }

    close(pipefd[1]);

    int fd = open(cfg.file_path.c_str(), O_RDONLY);
    if (fd < 0) {
        close(pipefd[0]);
        mq_close(mq);
        mq_unlink(qname);
        res.notes = "open input failed";
        return false;
    }

    std::vector<char> chunk(payload);
    unsigned long long total = 0;
    unsigned long long checksum = 0;

    while (1) {
        ssize_t n = read(fd, &chunk[0], chunk.size());
        if (n < 0) {
            if (errno == EINTR) {
                continue;
            }
            close(fd);
            close(pipefd[0]);
            mq_close(mq);
            mq_unlink(qname);
            res.notes = "read input failed";
            return false;
        }
        if (n == 0) {
            break;
        }
        checksum = fnv1a_update(checksum, &chunk[0], (size_t)n);
        total += (unsigned long long)n;
    }

    if (lseek(fd, 0, SEEK_SET) < 0) {
        close(fd);
        close(pipefd[0]);
        mq_close(mq);
        mq_unlink(qname);
        res.notes = "lseek failed";
        return false;
    }

    double t0 = now_seconds();

    char ctrl[17];
    ctrl[0] = 'S';
    unsigned long long sn = htonll_u64(cfg.file_size);
    unsigned long long cn = htonll_u64(checksum);
    std::memcpy(&ctrl[1], &sn, sizeof(sn));
    std::memcpy(&ctrl[9], &cn, sizeof(cn));
    if (mq_send(mq, ctrl, sizeof(ctrl), 0) != 0) {
        close(fd);
        close(pipefd[0]);
        mq_close(mq);
        mq_unlink(qname);
        res.notes = std::string("mq_send start failed: ") + std::strerror(errno);
        return false;
    }

    std::vector<char> msg(payload + 1);
    while (1) {
        ssize_t n = read(fd, &chunk[0], chunk.size());
        if (n < 0) {
            if (errno == EINTR) {
                continue;
            }
            close(fd);
            close(pipefd[0]);
            mq_close(mq);
            mq_unlink(qname);
            res.notes = "read input failed";
            return false;
        }
        if (n == 0) {
            break;
        }
        msg[0] = 'D';
        std::memcpy(&msg[1], &chunk[0], (size_t)n);
        if (mq_send(mq, &msg[0], (size_t)n + 1, 0) != 0) {
            close(fd);
            close(pipefd[0]);
            mq_close(mq);
            mq_unlink(qname);
            res.notes = std::string("mq_send payload failed: ") + std::strerror(errno);
            return false;
        }
    }

    char end = 'E';
    (void)mq_send(mq, &end, 1, 0);

    close(fd);

    ChildReport rep;
    std::memset(&rep, 0, sizeof(rep));
    (void)read(pipefd[0], &rep, sizeof(rep));
    close(pipefd[0]);

    int status = 0;
    waitpid(pid, &status, 0);
    double t1 = now_seconds();

    mq_close(mq);
    mq_unlink(qname);

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
