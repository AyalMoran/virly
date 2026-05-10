/**
 * @file MasterCommands.hpp
 * @brief Declares framework commands that implement master-side request handling.
 */
#ifndef ILRD_CONCRETE_MASTER_COMMANDS_HPP
#define ILRD_CONCRETE_MASTER_COMMANDS_HPP

#include "Framework.hpp"
#include "runtime/MasterRuntime.hpp"

namespace ilrd::concrete
{

/**
 * @brief Handles incoming read requests on the master.
 */
class MasterReadCommand : public ICommand
{
  public:
    /**
     * @brief Fans out a read request and arranges completion handling.
     * @param task Parsed framework task to execute.
     * @return Optional post-task scheduling information.
     */
    std::unique_ptr<PostTaskParams>
    Execute(SharedPtr<ITask> task) override;
};

/**
 * @brief Handles incoming write requests on the master.
 */
class MasterWriteCommand : public ICommand
{
  public:
    /**
     * @brief Fans out a write request and arranges completion handling.
     * @param task Parsed framework task to execute.
     * @return Optional post-task scheduling information.
     */
    std::unique_ptr<PostTaskParams>
    Execute(SharedPtr<ITask> task) override;
};

/**
 * @brief Handles incoming flush requests on the master.
 */
class MasterFlushCommand : public ICommand
{
  public:
    /**
     * @brief Dispatches a flush request to the relevant minion targets.
     * @param task Parsed framework task to execute.
     * @return Optional post-task scheduling information.
     */
    std::unique_ptr<PostTaskParams>
    Execute(SharedPtr<ITask> task) override;
};

/**
 * @brief Builds the command map used by the master framework instance.
 * @param runtime Active master runtime referenced by the command implementations.
 * @return Framework command map keyed by wire message type.
 */
Framework::CommandMap BuildMasterCommandMap(MasterRuntime& runtime);

} // namespace ilrd::concrete

#endif // ILRD_CONCRETE_MASTER_COMMANDS_HPP
