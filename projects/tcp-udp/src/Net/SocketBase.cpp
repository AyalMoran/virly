#include "Net/SocketBase.hpp"

#include <unistd.h>

SocketBase::SocketBase() : m_fd(-1)
{
}

SocketBase::SocketBase(int fd) : m_fd(fd)
{
}

SocketBase::~SocketBase()
{
    Close();
}

void SocketBase::Close()
{
    if (m_fd >= 0)
    {
        close(m_fd);
        m_fd = -1;
    }
}

bool SocketBase::IsOpen() const
{
    return m_fd >= 0;
}

int SocketBase::GetFd() const
{
    return m_fd;
}

void SocketBase::SetFd(int fd)
{
    m_fd = fd;
}
