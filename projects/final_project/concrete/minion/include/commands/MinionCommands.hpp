/**
 * @file MinionCommands.hpp
 * @brief Declares framework commands that implement minion-side request handling.
 */
#ifndef ILRD_CONCRETE_MINION_COMMANDS_HPP
#define ILRD_CONCRETE_MINION_COMMANDS_HPP

#include "Framework.hpp"
#include "runtime/MinionRuntime.hpp"

namespace ilrd::concrete
{

class ReadCommand : public ICommand
{
  public:
    std::unique_ptr<PostTaskParams>
    Execute(SharedPtr<ITask> task) override;
};

class WriteCommand : public ICommand
{
  public:
    std::unique_ptr<PostTaskParams>
    Execute(SharedPtr<ITask> task) override;
};

class FlushCommand : public ICommand
{
  public:
    std::unique_ptr<PostTaskParams>
    Execute(SharedPtr<ITask> task) override;
};

class HeartbeatCommand : public ICommand
{
  public:
    std::unique_ptr<PostTaskParams>
    Execute(SharedPtr<ITask> task) override;
};

/**
 * @brief Builds the command map used by the minion framework instance.
 * @param runtime Active minion runtime referenced by the command implementations.
 * @return Framework command map keyed by wire message type.
 */
Framework::CommandMap BuildMinionCommandMap(MinionRuntime& runtime);

} // namespace ilrd::concrete

#endif // ILRD_CONCRETE_MINION_COMMANDS_HPP
