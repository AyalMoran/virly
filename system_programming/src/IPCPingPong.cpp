/**************************************************************
 * File    : IPCPingPong.c
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

#include <assert.h>    // assert
#include <cerrno>      //  errno
#include <cstring>     // strerror
#include <fcntl.h>     // O_CREAT
#include <iostream>    // std::cout
#include <semaphore.h> // sem_t
#include <string>      // std::string

#include <cstdio>     // FILE
#include <cstdlib>    // EXIT_SUCCESS
#include <signal.h>   //sigprocmask
#include <sys/wait.h> // waitpid
#include <unistd.h>   // fork

#include <sys/stat.h> // mkfifo

#include <fstream> // std::ifstream
#include <mqueue.h>
#include <sstream> // std::istringstream
/*============================ INCLUDES ============================*/
#include "IPCPingPong.hpp"

/*========================== DEFINITIONS ===========================*/
#define TRUE (1)
#define FALSE (0)
#define SUCCESS (0)
#define FAILURE (1)

#pragma region SemTest

SemPingPong::SemPingPong(const char* sem_ping, const char* sem_pong,
                         bool is_pong) throw(SemException)
    : m_ping_name(std::string(sem_ping)), m_pong_name(std::string(sem_pong)),
      m_is_pong(is_pong)
{
    m_ping = sem_open(m_ping_name.c_str(), O_CREAT, 0644, 0);
    if (m_ping == SEM_FAILED)
    {
        throw SemException();
    }
    m_pong = sem_open(m_pong_name.c_str(), O_CREAT, 0644, 1);
    if (m_pong == SEM_FAILED)
    {
        throw SemException();
    }
}

SemPingPong::~SemPingPong()
{
    if (-1 == sem_close(m_ping))
    {
        std::cerr << m_ping_name << " failed to close. " << std::strerror(errno)
                  << std::endl;
    }
    if (-1 == sem_close(m_pong))
    {
        std::cerr << m_pong_name << " failed to close. " << std::strerror(errno)
                  << std::endl;
    }
}

SemPingPong::SemPingPong(const SemPingPong& other)
{
    this->m_ping_name = other.m_ping_name;
    this->m_pong_name = other.m_pong_name;
    this->m_is_pong = other.m_is_pong;
    m_ping = sem_open(m_ping_name.c_str(), O_CREAT, 0644, 0);
    if (m_ping == SEM_FAILED)
    {
        throw SemException();
    }
    m_pong = sem_open(m_pong_name.c_str(), O_CREAT, 0644, 0);
    if (m_pong == SEM_FAILED)
    {
        throw SemException();
    }
}

SemPingPong& SemPingPong::operator=(const SemPingPong& other)
{
    if (this != &other)
    {
        this->m_ping_name = other.m_ping_name;
        this->m_pong_name = other.m_pong_name;
        this->m_is_pong = other.m_is_pong;
        m_ping = sem_open(m_ping_name.c_str(), O_CREAT, 0644, 0);
        if (m_ping == SEM_FAILED)
        {
            throw SemException();
        }
        m_pong = sem_open(m_pong_name.c_str(), O_CREAT, 0644, 0);
        if (m_pong == SEM_FAILED)
        {
            throw SemException();
        }
    }

    return *this;
}

int SemPingPong::Ping()
{
    while (sem_wait(this->m_pong) == -1)
    {
        if (EINTR != errno)
        {
            std::cerr << m_pong_name << " failed to wait. "
                      << std::strerror(errno) << std::endl;
            return FAILURE;
        }
    }
    std::cout << "Ping\n";
    if (sem_post(this->m_ping) == -1)
    {
        std::cerr << m_ping_name << " failed to post. " << std::strerror(errno)
                  << std::endl;
        return FAILURE;
    }
    return 0;
}

int SemPingPong::Pong()
{
    while (sem_wait(this->m_ping) == -1)
    {
        if (EINTR != errno)
        {
            std::cerr << m_ping_name << " failed to wait. "
                      << std::strerror(errno) << std::endl;
            return FAILURE;
        }
    }
    std::cout << "Pong\n";
    if (-1 == sem_post(this->m_pong))
    {
        std::cerr << m_pong_name << " failed to post. " << std::strerror(errno)
                  << std::endl;
        return FAILURE;
    }
    return 0;
}

int SemPingPongFunc(char** argv, std::size_t num_rounds)
{

    if (0 == strcmp(argv[2], "ping"))
    {
        try
        {
            SemPingPong ping("/sem_ipc_ping", "/sem_ipc_pong", false);

            for (size_t i = 0; i < num_rounds; ++i)
            {
                ping.Ping();
                std::cout << i << std::endl;
            }
        }
        catch (const std::exception& e)
        {
            std::cerr << e.what() << '\n';
            return 1;
        }
    }
    else if (0 == strcmp(argv[2], "pong"))
    {
        try
        {
            SemPingPong pong("/sem_ipc_ping", "/sem_ipc_pong", false);

            for (size_t i = 0; i < num_rounds; ++i)
            {
                pong.Pong();
                std::cout << i << std::endl;
            }
        }
        catch (const std::exception& e)
        {
            std::cerr << e.what() << '\n';
            return 1;
        }
    }
    return 0;
}
#pragma endregion SemTest
#pragma region AnonPipeTest
int writer(const char* message, FILE* stream)
{
    if (fprintf(stream, "%s\n", message) < 0)
    {
        if (errno == EPIPE)
        {
            return EPIPE;
        }
    }
    if (fflush(stream) == EOF)
    {
        if (errno == EPIPE)
        {
            return EPIPE;
        }
    }
    return SUCCESS;
}

int reader(FILE* stream)
{
    char buffer[1024];

    if (fgets(buffer, sizeof(buffer), stream) != NULL)
    {
        fputs(buffer, stdout);
        std::cout << getpid() << std::endl;
        fflush(stdout);
        return SUCCESS;
    }
    return FAILURE;
}

static inline bool IsPong(pid_t pid)
{
    return pid == (pid_t)0;
}

static inline int BlockSignal(int sig)
{
    sigset_t set;
    sigemptyset(&set);
    sigaddset(&set, sig);
    if (sigprocmask(SIG_BLOCK, &set, NULL) == -1)
    {
        std::cerr << "Failed to block signal " << sig << ". "
                  << std::strerror(errno) << std::endl;
        return 1;
    }

    return 0;
}

static inline void PingPong(FILE* write_stream, FILE* read_stream,
                            const char* message, std::size_t num_rounds)
{
    for (size_t i = 0; i < num_rounds; ++i)
    {
        if (SUCCESS != reader(read_stream))
        {
            std::cerr << "Process " << getpid() << " failed to read from pipe. "
                      << std::strerror(errno) << std::endl;
            break;
        }

        if (SUCCESS != writer(message, write_stream))
        {
            std::cerr << "Process " << getpid() << " failed to write to pipe. "
                      << std::strerror(errno) << std::endl;
            break;
        }
    }
}

int PipePingPongFunc(std::size_t num_rounds)
{
    int ping_fd[2];
    int pong_fd[2];
    int status = SUCCESS;
    pid_t pid;

    pipe(ping_fd);
    pipe(pong_fd);

    if (SUCCESS != BlockSignal(SIGPIPE))
    {
        return 1;
    }

    pid = fork();
    if (IsPong(pid))
    {
        FILE* read_ping;
        FILE* write_pong;

        close(ping_fd[1]);
        close(pong_fd[0]);

        write_pong = fdopen(pong_fd[1], "w");
        read_ping = fdopen(ping_fd[0], "r");

        PingPong(write_pong, read_ping, "Pong", num_rounds);

        close(ping_fd[0]);
        close(pong_fd[1]);
    }
    else
    {
        FILE* read_pong;
        FILE* write_ping;

        close(ping_fd[0]);
        close(pong_fd[1]);

        write_ping = fdopen(ping_fd[1], "w");
        read_pong = fdopen(pong_fd[0], "r");

        if (SUCCESS != writer("Ping", write_ping))
        {
            std::cerr << "Process " << getpid() << " failed to write to pipe. "
                      << std::strerror(errno) << std::endl;
        }

        PingPong(write_ping, read_pong, "Ping", num_rounds - 1);

        waitpid(pid, NULL, 0);
        close(ping_fd[1]);
        close(pong_fd[0]);
    }

    return status;
}
#pragma endregion AnonPipeTest
#pragma region NamedPipeTest
static int FifoPingPong(int write_pipe, int read_pipe, const char* msg)
{
    char buffer[1024];
    if (read(read_pipe, buffer, sizeof(buffer)) < 0)
    {
        std::cerr << "Failed to read from fifo. " << std::strerror(errno)
                  << std::endl;
        return FAILURE;
    }
    std::cout << buffer << " " << getpid() << std::endl;

    if (write(write_pipe, msg, strlen(msg)) < 0)
    {
        std::cerr << "Failed to write " << msg << " to fifo."
                  << std::strerror(errno) << std::endl;
        return FAILURE;
    }
    return SUCCESS;
}

int NamedPipesFunc(char** argv, std::size_t num_rounds)
{

    int ping_fd;
    int pong_fd;

    if (0 == strcmp(argv[2], "ping"))
    {
        mkfifo("/tmp/fifo_ping", 0644);
        mkfifo("/tmp/fifo_pong", 0644);
        ping_fd = open("/tmp/fifo_ping", O_WRONLY);
        pong_fd = open("/tmp/fifo_pong", O_RDONLY);
        if (write(ping_fd, "Ping", strlen("Ping")) < 0)
        {
            std::cerr << "Failed to write Ping to fifo." << std::strerror(errno)
                      << std::endl;
            return FAILURE;
        }
        for (size_t i = 0; i < num_rounds; ++i)
        {
            FifoPingPong(ping_fd, pong_fd, "Ping");
            std::cout << i << std::endl;
        }
        close(ping_fd);
        close(pong_fd);
        unlink("/tmp/fifo_ping");
        unlink("/tmp/fifo_pong");
    }
    else if (0 == strcmp(argv[2], "pong"))
    {
        ping_fd = open("/tmp/fifo_ping", O_RDONLY);
        pong_fd = open("/tmp/fifo_pong", O_WRONLY);
        for (size_t i = 0; i < num_rounds; ++i)
        {
            FifoPingPong(pong_fd, ping_fd, "Pong");
            std::cout << i << std::endl;
        }
        close(ping_fd);
        close(pong_fd);
        unlink("/tmp/fifo_ping");
        unlink("/tmp/fifo_pong");
    }

    return SUCCESS;
}
#pragma endregion NamedPipeTest
#pragma region MsgQTest

const char* MSGQ_NAME = "/msgq_ipc_pingpong";

int MessageQueueFunc(char** argv, const char* msg)
{
    struct mq_attr attr;
    attr.mq_flags = 0;
    attr.mq_maxmsg = 10;
    attr.mq_msgsize = 1024;
    attr.mq_curmsgs = 0;

    mqd_t msgq = mq_open(MSGQ_NAME, O_CREAT | O_RDWR, 0666, &attr);
    if (msgq == (mqd_t)-1)
    {
        std::cerr << "Failed to create/open message queue. "
                  << std::strerror(errno) << std::endl;
        return 1;
    }

    if (strcmp(argv[2], "prod") == 0)
    {
        if (msg == NULL)
        {
            std::cout << "producing ";
            std::ifstream story(
                "/home/moranayal/repos/ILRD/git/utils/story.txt");
            for (std::string buffer; std::getline(story, buffer);)
            {
                std::cout << "wrote \"" << buffer << "\" to msgq" << std::endl;
                mq_send(msgq, buffer.c_str(), buffer.length(), 0);
            }
        }
        else
        {
            mq_send(msgq, msg, strlen(msg), 0);
        }
    }
    else
    {
        char* buffer = new char[attr.mq_msgsize];
        ssize_t bytes_received = mq_receive(msgq, buffer, attr.mq_msgsize, 0);
        if(bytes_received == -1)
        {
            std::cerr << "Failed to receive message from queue. "
                      << std::strerror(errno) << std::endl;
            delete[] buffer;
            return 1;
        }
        if (bytes_received > 0)
        {
            buffer[bytes_received] = '\0';
            std::cout << "Received: " << buffer << std::endl;
        }
        
        delete[] buffer;
    }

    mq_getattr(msgq, &attr);
    std::cout << "Current number of messages in queue: " << attr.mq_curmsgs
              << std::endl;
    mq_close(msgq);
    if (attr.mq_curmsgs == 0)
    {
        mq_unlink(MSGQ_NAME);
    }
    return 0;
}

#pragma endregion MsgQTest
