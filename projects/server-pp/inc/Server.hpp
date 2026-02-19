
#include "Net/TcpSocket.hpp"      // TcpSocket
#include "UdpSocket.hpp"      // UdpSocket
#include "Endpoint.hpp"       // Endpoint

#include <string>             // std::string
#include <sys/epoll.h>        // epoll_event
#include <vector>             // std::vector
#include <map>                // std::map

class Server
{
  public:
    Server();
    explicit Server(int epollFd, int timeout = -1);

    virtual ~Server();

    Server& SetFd(int fd);
    int GetFd();

    int Add(int fd, uint32_t events) const;
    int Remove(int fd, uint32_t events) const;
    int Modify(int fd, uint32_t events) const;
    int Wait(struct epoll_event* events, int maxEvents, int timeout) const;

    void Run();
    int Stop();

    protected:
    int Register(int fd);
    virtual void HandleReadEvent(int fd);
    virtual void HandleWriteEvent(int fd);
    virtual void HandleErrorEvent(int fd);
    void HandleStdinInput();
    std::string ReadFromSocket(int fd);
    void WriteToSocket(int fd);

  private:
    Server(const Server&);
    Server& operator=(const Server&);

    TcpSocket m_TcpListener;
    UdpSocket m_UdpListener;
    std::map<int, TcpSocket*> m_tcpClients;
    Endpoint m_pendingUdpPeer;
    std::string m_pendingUdpReply;
    bool m_hasPendingUdpReply;
    std::string m_stdinBuffer;
    bool m_stopRequested;
    std::vector<struct epoll_event> m_events;
    int m_epollFd;
    int m_timeout;
};
