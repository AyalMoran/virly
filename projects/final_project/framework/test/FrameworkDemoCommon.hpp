/**************************************************************
 * File    : FrameworkDemoCommon.hpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    : 2026-03-24
 **************************************************************/
#ifndef ILRD_FRAMEWORK_DEMO_COMMON_HPP
#define ILRD_FRAMEWORK_DEMO_COMMON_HPP

#include <string>

#include "Framework.hpp"

namespace ilrd
{
namespace demo
{

enum TaskKey
{
    PRINT_TASK = 1,
    QUIT_TASK = 2
};

class DemoTask : public ITask
{
  public:
    explicit DemoTask(int key, const std::string& payload = std::string())
        : m_key(key), m_payload(payload)
    {
    }

    int GetKey() const override
    {
        return m_key;
    }

    const std::string& GetPayload() const
    {
        return m_payload;
    }

  private:
    int m_key;
    std::string m_payload;
};

} // namespace demo
} // namespace ilrd

#endif /* ILRD_FRAMEWORK_DEMO_COMMON_HPP */
