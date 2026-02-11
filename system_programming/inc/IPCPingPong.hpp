/**************************************************************
 * File    : IPCPingPong.hpp
 * Author  : Ayal Moran
 * Reviewer: Oshri F.
 * Date    : 11-02-2026
 **************************************************************/
#ifndef _ILRD_IPCPINGPONG_H
#define _ILRD_IPCPINGPONG_H

#include <semaphore.h>
#include <string>
#include <mqueue.h>

/*Declarations for IPCPingPong*/
class SemException : public std::exception
{
  public:
    virtual const char* what() const throw()
    {
        return "Semaphore failed to open";
    }
};

class SemPingPong
{
  public:
    SemPingPong(const char* sem_ping, const char* sem_pong,
                bool is_pong) throw(SemException);
    SemPingPong(const SemPingPong&);
    ~SemPingPong();

    int Ping();
    int Pong();

    SemPingPong& operator=(const SemPingPong&);

  private:
    std::string m_ping_name;
    std::string m_pong_name;

    sem_t* m_ping;
    sem_t* m_pong;
    bool m_is_pong;
};


int SemPingPongFunc(char** argv, std::size_t num_rounds);

int PipePingPongFunc(std::size_t num_round);

int NamedPipesFunc(char** argv, std::size_t num_rounds);

int MessageQueueFunc(char** argv, const char* msg);

int SharedMemoryFunc(char** argv, const char* msg, int number_of_readers);


#endif /* _ILRD_IPCPINGPONG_H */
