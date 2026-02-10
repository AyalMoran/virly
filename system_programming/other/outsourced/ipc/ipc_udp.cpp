#include "ipc_methods.hpp"

#include <sys/types.h>
#include <sys/socket.h>
#include <sys/wait.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <fcntl.h>
#include <cerrno>
#include <cstdio>
#include <cstring>
#include <vector>

struct ChildReport {
    unsigned long long bytes;
    unsigned long long checksum;
    unsigned long long lost_packets;
    int protocol_ok;
};

static void wr_u32(char *p, unsigned int x) {
    unsigned int n = htonl(x);
    std::memcpy(p, &n, sizeof(n));
}

static unsigned int rd_u32(const char *p) {
    unsigned int n;
    std::memcpy(&n, p, sizeof(n));
    return ntohl(n);
}

bool run_udp(const Config &cfg, Result &res) {
    init_result(res, "udp");

    const size_t max_payload = 1400;
    size_t payload_size = cfg.chunk_size;
    if (payload_size > max_payload) {
        payload_size = max_payload;
    }

    int recv_fd = socket(AF_INET, SOCK_DGRAM, 0);
    if (recv_fd < 0) {
        res.notes = "recv socket failed";
        return false;
    }

    struct timeval tv;
    tv.tv_sec = 5;
    tv.tv_usec = 0;
    setsockopt(recv_fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));

    struct sockaddr_in recv_addr;
    std::memset(&recv_addr, 0, sizeof(recv_addr));
    recv_addr.sin_family = AF_INET;
    recv_addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    recv_addr.sin_port = htons(0);

    if (bind(recv_fd, (struct sockaddr*)&recv_addr, sizeof(recv_addr)) != 0) {
        close(recv_fd);
        res.notes = "bind failed";
        return false;
    }

    socklen_t alen = sizeof(recv_addr);
    if (getsockname(recv_fd, (struct sockaddr*)&recv_addr, &alen) != 0) {
        close(recv_fd);
        res.notes = "getsockname failed";
        return false;
    }

    int pipefd[2];
    if (pipe(pipefd) != 0) {
        close(recv_fd);
        res.notes = "pipe failed";
        return false;
    }

    pid_t pid = fork();
    if (pid < 0) {
        close(pipefd[0]);
        close(pipefd[1]);
        close(recv_fd);
        res.notes = "fork failed";
        return false;
    }

    if (pid == 0) {
        close(pipefd[0]);

        ChildReport rep;
        rep.bytes = 0;
        rep.checksum = 0;
        rep.lost_packets = 0;
        rep.protocol_ok = 0;

        std::vector<char> packet(max_payload + 64);
        unsigned long long expected_size = 0;
        unsigned long long expected_checksum = 0;
        unsigned int expected_seq = 0;
        int got_start = 0;

        while (1) {
            ssize_t n = recvfrom(recv_fd, &packet[0], packet.size(), 0, 0, 0);
            if (n < 0) {
                if (errno == EINTR) {
                    continue;
                }
                break;
            }
            if (n < 1) {
                continue;
            }

            char type = packet[0];
            if (type == 'S' && n >= 17) {
                unsigned long long sn;
                unsigned long long cn;
                std::memcpy(&sn, &packet[1], sizeof(sn));
                std::memcpy(&cn, &packet[9], sizeof(cn));
                expected_size = ntohll_u64(sn);
                expected_checksum = ntohll_u64(cn);
                got_start = 1;
            } else if (type == 'D' && got_start && n >= 7) {
                unsigned int seq = rd_u32(&packet[1]);
                unsigned int plen = (unsigned int)(((unsigned char)packet[5] << 8) | (unsigned char)packet[6]);
                if ((size_t)(n - 7) != plen) {
                    rep.lost_packets++;
                    continue;
                }
                if (seq != expected_seq) {
                    if (seq > expected_seq) {
                        rep.lost_packets += (unsigned long long)(seq - expected_seq);
                    }
                    expected_seq = seq + 1;
                } else {
                    expected_seq++;
                }
                rep.bytes += plen;
                rep.checksum = fnv1a_update(rep.checksum, &packet[7], plen);
            } else if (type == 'E') {
                break;
            }
        }

        rep.protocol_ok = (got_start && rep.bytes == expected_size && rep.checksum == expected_checksum && rep.lost_packets == 0) ? 1 : 0;

        (void)write(pipefd[1], &rep, sizeof(rep));
        close(pipefd[1]);
        close(recv_fd);
        _exit(rep.protocol_ok ? 0 : 2);
    }

    close(pipefd[1]);

    int send_fd = socket(AF_INET, SOCK_DGRAM, 0);
    if (send_fd < 0) {
        close(pipefd[0]);
        close(recv_fd);
        res.notes = "send socket failed";
        return false;
    }

    std::vector<char> send_packet(max_payload + 64);

    int fd = open(cfg.file_path.c_str(), O_RDONLY);
    if (fd < 0) {
        close(send_fd);
        close(pipefd[0]);
        close(recv_fd);
        res.notes = "open input failed";
        return false;
    }

    std::vector<char> chunk(payload_size);
    unsigned long long checksum = 0;
    unsigned long long total = 0;

    while (1) {
        ssize_t n = read(fd, &chunk[0], chunk.size());
        if (n < 0) {
            if (errno == EINTR) {
                continue;
            }
            close(fd);
            close(send_fd);
            close(pipefd[0]);
            close(recv_fd);
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
        close(send_fd);
        close(pipefd[0]);
        close(recv_fd);
        res.notes = "lseek failed";
        return false;
    }

    double t0 = now_seconds();

    send_packet[0] = 'S';
    unsigned long long sn = htonll_u64(cfg.file_size);
    unsigned long long cn = htonll_u64(checksum);
    std::memcpy(&send_packet[1], &sn, sizeof(sn));
    std::memcpy(&send_packet[9], &cn, sizeof(cn));
    if (sendto(send_fd, &send_packet[0], 17, 0, (struct sockaddr*)&recv_addr, sizeof(recv_addr)) < 0) {
        close(fd);
        close(send_fd);
        close(pipefd[0]);
        close(recv_fd);
        res.notes = "send start failed";
        return false;
    }

    unsigned int seq = 0;
    while (1) {
        ssize_t n = read(fd, &chunk[0], chunk.size());
        if (n < 0) {
            if (errno == EINTR) {
                continue;
            }
            close(fd);
            close(send_fd);
            close(pipefd[0]);
            close(recv_fd);
            res.notes = "read input failed";
            return false;
        }
        if (n == 0) {
            break;
        }

        send_packet[0] = 'D';
        wr_u32(&send_packet[1], seq++);
        send_packet[5] = (char)(((unsigned int)n >> 8) & 0xFF);
        send_packet[6] = (char)((unsigned int)n & 0xFF);
        std::memcpy(&send_packet[7], &chunk[0], (size_t)n);

        ssize_t s = sendto(send_fd, &send_packet[0], (size_t)n + 7, 0, (struct sockaddr*)&recv_addr, sizeof(recv_addr));
        if (s < 0) {
            close(fd);
            close(send_fd);
            close(pipefd[0]);
            close(recv_fd);
            res.notes = "send payload failed";
            return false;
        }
    }

    send_packet[0] = 'E';
    (void)sendto(send_fd, &send_packet[0], 1, 0, (struct sockaddr*)&recv_addr, sizeof(recv_addr));

    close(fd);
    close(send_fd);

    ChildReport rep;
    std::memset(&rep, 0, sizeof(rep));
    (void)read(pipefd[0], &rep, sizeof(rep));
    close(pipefd[0]);

    int status = 0;
    waitpid(pid, &status, 0);
    double t1 = now_seconds();

    close(recv_fd);

    res.seconds = t1 - t0;
    res.bytes_sent = total;
    res.bytes_received = rep.bytes;
    res.sender_checksum = checksum;
    res.receiver_checksum = rep.checksum;
    res.correct = (rep.protocol_ok == 1);
    res.reliable = (rep.lost_packets == 0 && res.correct);
    if (res.seconds > 0.0) {
        res.mb_per_sec = (double)total / (1024.0 * 1024.0) / res.seconds;
    }
    if (!res.correct) {
        char note[128];
        std::snprintf(note, sizeof(note), "lost_packets=%llu", rep.lost_packets);
        res.notes = note;
    }

    return true;
}
