#include "commands/MasterCommands.hpp"

#include <cstdint>
#include <memory>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include "DebugLogger.hpp"
#include "Logger.hpp"
#include "tasks/ConcreteTasks.hpp"

namespace ilrd::concrete
{

namespace
{

void LogCommandError(const std::string& command_name, const std::string& message,
                     Logger::Level level = Logger::Level::WARNING)
{
    Logger::Instance().Log(command_name + ": " + message, level);
}

ICommand* CreateMasterReadCommand()
{
    return new MasterReadCommand();
}

ICommand* CreateMasterWriteCommand()
{
    return new MasterWriteCommand();
}

ICommand* CreateMasterFlushCommand()
{
    return new MasterFlushCommand();
}

void CompleteSendFailureSafely(MasterRuntime& runtime,
                               const UUID& request_id,
                               wire::MessageType expected_response_type,
                               const char* command_name,
                               const std::exception& error)
{
    LogCommandError(command_name, error.what(), Logger::Level::ERROR);
    runtime.AbortRequest(request_id, expected_response_type);
}

struct DispatchOperation
{
    IMinionProxy* proxy = nullptr;
    std::uint64_t local_offset = 0;
    std::uint64_t logical_offset = 0;
    std::uint32_t length = 0;
    std::vector<std::uint8_t> payload;
};

const RAIDManager::PlacementTarget& SelectReadTarget(
    MasterRuntime& runtime,
    const RAIDManager::PlacementSegment& segment,
    const UUID& request_id)
{
    if (segment.primary.active)
    {
        ILRD_DEBUG_LOG("MasterReadCommand selected primary target " +
                       segment.primary.node_id.ToString());
        return segment.primary;
    }

    if (segment.mirror.has_value() && segment.mirror->active)
    {
        runtime.MarkRequestDegraded(request_id);
        runtime.GetRAIDManager().MarkNodeOutOfSync(segment.primary.node_id);
        ILRD_DEBUG_LOG_LEVEL("MasterReadCommand falling back to mirror " +
                                 segment.mirror->node_id.ToString(),
                             Logger::Level::WARNING);
        return *segment.mirror;
    }

    throw std::logic_error("MasterReadCommand has no active read replica");
}

std::vector<UUID> BuildChildRequestIds(const UUID& parent_request_id,
                                       std::size_t operation_count)
{
    std::vector<UUID> request_ids;
    request_ids.reserve(operation_count);
    if (1 == operation_count)
    {
        request_ids.push_back(parent_request_id);
        return request_ids;
    }

    for (std::size_t i = 0; i < operation_count; ++i)
    {
        request_ids.push_back(UUID());
    }

    return request_ids;
}

std::unique_ptr<ICommand::PostTaskParams> MakeRetryParams(
    MasterRuntime& runtime, const UUID& parent_request_id)
{
    if (!runtime.HasPendingChildren(parent_request_id))
    {
        return std::unique_ptr<ICommand::PostTaskParams>();
    }

    std::unique_ptr<ICommand::PostTaskParams> params(
        new ICommand::PostTaskParams());
    params->time_interval = runtime.GetRetryConfig().interval;
    params->action = [&runtime, parent_request_id]()
    {
        return runtime.RetransmitPendingChildren(parent_request_id);
    };
    return params;
}

} // namespace

std::unique_ptr<ICommand::PostTaskParams>
MasterReadCommand::Execute(SharedPtr<ITask> task)
{
    ReadTask* const request = dynamic_cast<ReadTask*>(task.operator->());
    if (nullptr == request)
    {
        LogCommandError("MasterReadCommand", "received non-ReadTask");
        return std::unique_ptr<PostTaskParams>();
    }

    MasterRuntime& runtime = GetActiveMasterRuntime();
    const UUID& request_id = request->GetRequestId();
    ILRD_DEBUG_LOG("MasterReadCommand executing request_id=" +
                   request_id.ToString() + " offset=" +
                   std::to_string(request->GetLogicalOffset()) + " length=" +
                   std::to_string(request->GetOperationLength()));

    try
    {
        runtime.StartRequest(request_id, wire::MessageType::READ_RESP);
        const std::vector<RAIDManager::PlacementSegment> placements =
            runtime.GetRAIDManager().ResolveReadPlacements(
                request->GetLogicalOffset(),
                request->GetOperationLength());
        std::vector<DispatchOperation> operations;
        operations.reserve(placements.size());
        for (const RAIDManager::PlacementSegment& segment : placements)
        {
            const RAIDManager::PlacementTarget& target =
                SelectReadTarget(runtime, segment, request_id);
            operations.push_back(
                DispatchOperation{target.proxy,
                                  target.local_offset,
                                  segment.logical_offset,
                                  segment.length,
                                  {}});
        }

        const std::vector<UUID> child_request_ids =
            BuildChildRequestIds(request_id, operations.size());
        for (std::size_t i = 0; i < operations.size(); ++i)
        {
            IMinionProxy* const proxy = operations[i].proxy;
            const std::uint64_t local_offset = operations[i].local_offset;
            const std::uint32_t length = operations[i].length;
            const UUID child_request_id = child_request_ids[i];
            MasterRuntime::ResendAction resend_action =
                [proxy, local_offset, length, child_request_id]()
            {
                proxy->SendReadRequest(local_offset, length, child_request_id);
            };

            runtime.RegisterChildRequest(request_id,
                                         child_request_id,
                                         wire::MessageType::READ_RESP,
                                         operations[i].logical_offset,
                                         operations[i].length,
                                         resend_action);
            resend_action();
        }

        runtime.CompleteRequestIfReady(request_id);
        return MakeRetryParams(runtime, request_id);
    }
    catch (const std::exception& error)
    {
        CompleteSendFailureSafely(runtime, request_id, wire::MessageType::READ_RESP,
                                  "MasterReadCommand", error);
    }

    return std::unique_ptr<PostTaskParams>();
}

std::unique_ptr<ICommand::PostTaskParams>
MasterWriteCommand::Execute(SharedPtr<ITask> task)
{
    WriteTask* const request = dynamic_cast<WriteTask*>(task.operator->());
    if (nullptr == request)
    {
        LogCommandError("MasterWriteCommand", "received non-WriteTask");
        return std::unique_ptr<PostTaskParams>();
    }

    MasterRuntime& runtime = GetActiveMasterRuntime();
    const UUID& request_id = request->GetRequestId();
    ILRD_DEBUG_LOG("MasterWriteCommand executing request_id=" +
                   request_id.ToString() + " offset=" +
                   std::to_string(request->GetLogicalOffset()) + " length=" +
                   std::to_string(request->GetOperationLength()));

    try
    {
        runtime.StartRequest(request_id, wire::MessageType::WRITE_RESP);
        const std::vector<RAIDManager::PlacementSegment> placements =
            runtime.GetRAIDManager().ResolveWritePlacements(
                request->GetLogicalOffset(),
                request->GetOperationLength());
        std::vector<DispatchOperation> operations;

        for (const RAIDManager::PlacementSegment& segment : placements)
        {
            if (segment.primary.active)
            {
                const std::size_t data_offset =
                    static_cast<std::size_t>(segment.logical_offset -
                                             request->GetLogicalOffset());
                const std::size_t data_length = segment.length;
                operations.push_back(
                    DispatchOperation{
                        segment.primary.proxy,
                        segment.primary.local_offset,
                        segment.logical_offset,
                        segment.length,
                        std::vector<std::uint8_t>(request->GetData().begin() + data_offset,
                                                  request->GetData().begin() + data_offset + data_length)});
            }
            else
            {
                runtime.MarkRequestDegraded(request_id);
                runtime.GetRAIDManager().MarkNodeOutOfSync(segment.primary.node_id);
            }

            if (segment.mirror.has_value())
            {
                if (segment.mirror->active)
                {
                    const std::size_t data_offset =
                        static_cast<std::size_t>(segment.logical_offset -
                                                 request->GetLogicalOffset());
                    const std::size_t data_length = segment.length;
                    if (!segment.primary.active || segment.primary.proxy != segment.mirror->proxy)
                    {
                        operations.push_back(
                            DispatchOperation{
                                segment.mirror->proxy,
                                segment.mirror->local_offset,
                                segment.logical_offset,
                                segment.length,
                                std::vector<std::uint8_t>(request->GetData().begin() + data_offset,
                                                          request->GetData().begin() + data_offset + data_length)});
                    }
                }
                else
                {
                    runtime.MarkRequestDegraded(request_id);
                    runtime.GetRAIDManager().MarkNodeOutOfSync(segment.mirror->node_id);
                }
            }

            if (!segment.primary.active &&
                (!segment.mirror.has_value() || !segment.mirror->active))
            {
                throw std::logic_error("MasterWriteCommand has no active write replica");
            }
        }

        const std::vector<UUID> child_request_ids =
            BuildChildRequestIds(request_id, operations.size());
        for (std::size_t i = 0; i < operations.size(); ++i)
        {
            IMinionProxy* const proxy = operations[i].proxy;
            const std::uint64_t local_offset = operations[i].local_offset;
            const std::vector<std::uint8_t> payload = operations[i].payload;
            const UUID child_request_id = child_request_ids[i];
            MasterRuntime::ResendAction resend_action =
                [proxy, local_offset, payload, child_request_id]()
            {
                proxy->SendWriteRequest(local_offset, payload, child_request_id);
            };

            runtime.RegisterChildRequest(request_id,
                                         child_request_id,
                                         wire::MessageType::WRITE_RESP,
                                         0,
                                         0,
                                         resend_action);
            resend_action();
        }

        runtime.CompleteRequestIfReady(request_id);
        return MakeRetryParams(runtime, request_id);
    }
    catch (const std::exception& error)
    {
        CompleteSendFailureSafely(runtime, request_id, wire::MessageType::WRITE_RESP,
                                  "MasterWriteCommand", error);
    }

    return std::unique_ptr<PostTaskParams>();
}

std::unique_ptr<ICommand::PostTaskParams>
MasterFlushCommand::Execute(SharedPtr<ITask> task)
{
    FlushTask* const request = dynamic_cast<FlushTask*>(task.operator->());
    if (nullptr == request)
    {
        LogCommandError("MasterFlushCommand", "received non-FlushTask");
        return std::unique_ptr<PostTaskParams>();
    }

    MasterRuntime& runtime = GetActiveMasterRuntime();
    const UUID& request_id = request->GetRequestId();
    ILRD_DEBUG_LOG("MasterFlushCommand executing request_id=" +
                   request_id.ToString());

    try
    {
        const std::vector<RAIDManager::PlacementTarget> targets =
            runtime.GetRAIDManager().ResolveFlushTargets();
        if (targets.empty())
        {
            throw std::logic_error("MasterFlushCommand has no active flush targets");
        }

        runtime.StartRequest(request_id, wire::MessageType::FLUSH_RESP);
        if (targets.size() != runtime.GetRAIDManager().GetNodeCount())
        {
            runtime.MarkRequestDegraded(request_id);
        }
        const std::vector<UUID> child_request_ids =
            BuildChildRequestIds(request_id, targets.size());
        for (std::size_t i = 0; i < targets.size(); ++i)
        {
            IMinionProxy* const proxy = targets[i].proxy;
            const UUID child_request_id = child_request_ids[i];
            MasterRuntime::ResendAction resend_action =
                [proxy, child_request_id]()
            {
                proxy->SendFlushRequest(child_request_id);
            };

            runtime.RegisterChildRequest(request_id,
                                         child_request_id,
                                         wire::MessageType::FLUSH_RESP,
                                         0,
                                         0,
                                         resend_action);
            resend_action();
        }

        runtime.CompleteRequestIfReady(request_id);
        return MakeRetryParams(runtime, request_id);
    }
    catch (const std::exception& error)
    {
        CompleteSendFailureSafely(runtime, request_id, wire::MessageType::FLUSH_RESP,
                                  "MasterFlushCommand", error);
    }

    return std::unique_ptr<PostTaskParams>();
}

Framework::CommandMap BuildMasterCommandMap(MasterRuntime& runtime)
{
    SetActiveMasterRuntime(runtime);
    ILRD_DEBUG_LOG("BuildMasterCommandMap activated runtime");

    Framework::CommandMap command_map;
    command_map[READ_COMMAND_KEY] = &CreateMasterReadCommand;
    command_map[WRITE_COMMAND_KEY] = &CreateMasterWriteCommand;
    command_map[FLUSH_COMMAND_KEY] = &CreateMasterFlushCommand;
    ILRD_DEBUG_LOG("BuildMasterCommandMap registered master command set");
    return command_map;
}

} // namespace ilrd::concrete
