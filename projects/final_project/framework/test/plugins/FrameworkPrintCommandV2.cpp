/**************************************************************
 * File    : FrameworkPrintCommandV2.cpp
 * Author  : Ayal Moran
 * Reviewer:
 * Date    : 2026-03-24
 **************************************************************/

#include <iostream>  // std::cout
#include <memory>    // std::unique_ptr

#include "Framework.hpp"
#include "FrameworkDemoCommon.hpp"

namespace
{

class PrintCommandV2 : public ilrd::ICommand
{
  public:
    std::unique_ptr<WaitForResponseParams>
    Execute(ilrd::SharedPtr<ilrd::ITask> task) override
    {
        ilrd::demo::DemoTask& demo_task =
            dynamic_cast<ilrd::demo::DemoTask&>(*task);
        std::cout << "PrintCommandV2: plugin override" << std::endl;
        std::cout << "PrintCommandV2 payload: " << demo_task.GetPayload()
                  << std::endl;
        return std::unique_ptr<WaitForResponseParams>();
    }
};

ilrd::ICommand* CreatePrintCommandV2()
{
    return new PrintCommandV2();
}

struct Registrar
{
    Registrar()
    {
        ilrd::RegisterCommandCreator(ilrd::demo::PRINT_TASK,
                                     &CreatePrintCommandV2);
    }
};

Registrar g_registrar;

} // namespace
