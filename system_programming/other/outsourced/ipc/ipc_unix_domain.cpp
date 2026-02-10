#include "ipc_methods.hpp"

#include <sys/types.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/wait.h>
#include <unistd.h>
#include <fcntl.h>
#include <cerrno>
#include <cstdio>
#include <cstring>
#include <vector>

struct UdsHeader {
    unsigned long long size_net;
    unsigned long long checksum_net;
};

struct ChildReport {
    unsigned long long bytes;
    unsigned long long checksum;
    int protocol_ok;
};

bool run_unix_domain(const Config &cfg, Result &res) {
    init_result(res, "unix_domain");

    int listen_fd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (listen_fd < 0) {
        res.notes = "socket failed";
        return false;
    }

    char sock_path[108];
    std::snprintf(sock_path, sizeof(sock_path), "/tmp/ipc_uds_%d.sock", (int)getpid());
    unlink(sock_path);

    struct sockaddr_un addr;
    std::memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    std::strncpy(addr.sun_path, sock_path, sizeof(addr.sun_path) - 1);

    if (bind(listen_fd, (struct sockaddr*)&addr, sizeof(addr)) != 0) {
        close(listen_fd);
        res.notes = "bind failed";
        return false;
    }

    if (listen(listen_fd, 1) != 0) {
        close(listen_fd);
        unlink(sock_path);
        res.notes = "listen failed";
        return false;
    }

    int pipefd[2];
    if (pipe(pipefd) != 0) {
        close(listen_fd);
        unlink(sock_path);
        res.notes = "pipe failed";
        return false;
    }

    pid_t pid = fork();
    if (pid < 0) {
        close(pipefd[0]);
        close(pipefd[1]);
        close(listen_fd);
        unlink(sock_path);
        res.notes = "fork failed";
        return false;
    }

    if (pid == 0) {
        close(pipefd[0]);
        int conn = accept(listen_fd, 0, 0);
        close(listen_fd);

        ChildReport rep;
        rep.bytes = 0;
        rep.checksum = 0;
        rep.protocol_ok = 0;

        if (conn >= 0) {
            UdsHeader h;
            if (recv_all(conn, (char*)&h, sizeof(h))) {
                unsigned long long expected_size = ntohll_u64(h.size_net);
                unsigned long long expected_checksum = ntohll_u64(h.checksum_net);

                std::vector<char> buf(cfg.chunk_size);
                unsigned long long total = 0;
                unsigned long long checksum = 0;

                while (1) {
                    ssize_t n = read(conn, &buf[0], buf.size());
                    if (n < 0) {
                        if (errno == EINTR) {
                            continue;
                        }
                        break;
                    }
                    if (n == 0) {
                        break;
                    }
                    total += (unsigned long long)n;
                    checksum = fnv1a_update(checksum, &buf[0], (size_t)n);
                }

                rep.bytes = total;
                rep.checksum = checksum;
                rep.protocol_ok = (total == expected_size && checksum == expected_checksum) ? 1 : 0;
            }
            close(conn);
        }

        (void)write(pipefd[1], &rep, sizeof(rep));
        close(pipefd[1]);
        _exit(rep.protocol_ok ? 0 : 2);
    }

    close(pipefd[1]);

    int conn_fd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (conn_fd < 0) {
        close(pipefd[0]);
        close(listen_fd);
        unlink(sock_path);
        res.notes = "client socket failed";
        return false;
    }

    double t0 = now_seconds();
    if (connect(conn_fd, (struct sockaddr*)&addr, sizeof(addr)) != 0) {
        close(conn_fd);
        close(pipefd[0]);
        close(listen_fd);
        unlink(sock_path);
        res.notes = "connect failed";
        return false;
    }

    int fd = open(cfg.file_path.c_str(), O_RDONLY);
    if (fd < 0) {
        close(conn_fd);
        close(pipefd[0]);
        close(listen_fd);
        unlink(sock_path);
        res.notes = "open input failed";
        return false;
    }

    std::vector<char> buf(cfg.chunk_size);
    unsigned long long total = 0;
    unsigned long long checksum = 0;

    while (1) {
        ssize_t n = read(fd, &buf[0], buf.size());
        if (n < 0) {
            if (errno == EINTR) {
                continue;
            }
            close(fd);
            close(conn_fd);
            close(pipefd[0]);
            close(listen_fd);
            unlink(sock_path);
            res.notes = "read input failed";
            return false;
        }
        if (n == 0) {
            break;
        }
        checksum = fnv1a_update(checksum, &buf[0], (size_t)n);
        total += (unsigned long long)n;
    }

    if (lseek(fd, 0, SEEK_SET) < 0) {
        close(fd);
        close(conn_fd);
        close(pipefd[0]);
        close(listen_fd);
        unlink(sock_path);
        res.notes = "lseek failed";
        return false;
    }

    UdsHeader h;
    h.size_net = htonll_u64(cfg.file_size);
    h.checksum_net = htonll_u64(checksum);
    if (!send_all(conn_fd, (const char*)&h, sizeof(h))) {
        close(fd);
        close(conn_fd);
        close(pipefd[0]);
        close(listen_fd);
        unlink(sock_path);
        res.notes = "send header failed";
        return false;
    }

    while (1) {
        ssize_t n = read(fd, &buf[0], buf.size());
        if (n < 0) {
            if (errno == EINTR) {
                continue;
            }
            close(fd);
            close(conn_fd);
            close(pipefd[0]);
            close(listen_fd);
            unlink(sock_path);
            res.notes = "read input failed";
            return false;
        }
        if (n == 0) {
            break;
        }
        if (!send_all(conn_fd, &buf[0], (size_t)n)) {
            close(fd);
            close(conn_fd);
            close(pipefd[0]);
            close(listen_fd);
            unlink(sock_path);
            res.notes = "send payload failed";
            return false;
        }
    }

    close(fd);
    shutdown(conn_fd, SHUT_WR);
    close(conn_fd);
    close(listen_fd);

    ChildReport rep;
    std::memset(&rep, 0, sizeof(rep));
    (void)read(pipefd[0], &rep, sizeof(rep));
    close(pipefd[0]);

    int status = 0;
    waitpid(pid, &status, 0);
    double t1 = now_seconds();

    unlink(sock_path);

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
