#ifndef NET_SOCKET_BASE_HPP
#define NET_SOCKET_BASE_HPP

class SocketBase
{
  public:
    SocketBase();
    explicit SocketBase(int fd);
    virtual ~SocketBase();

    void Close();
    bool IsOpen() const;
    int GetFd() const;

  protected:
    void SetFd(int fd);

  private:
    SocketBase(const SocketBase&);
    SocketBase& operator=(const SocketBase&);

  private:
    int m_fd;
};

#endif
