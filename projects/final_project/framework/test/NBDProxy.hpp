/**************************************************************
 * File    : NBDProxy.hpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    : 2026-03-24
 **************************************************************/
#ifndef ILRD_NBD_PROXY_HPP
#define ILRD_NBD_PROXY_HPP

#include "Framework.hpp"

namespace ilrd
{

class NBDProxy : public IInputProxy
{
  public:
    ITask* GetTask(int fd) override;
};

} // namespace ilrd

#endif /* ILRD_NBD_PROXY_HPP */
