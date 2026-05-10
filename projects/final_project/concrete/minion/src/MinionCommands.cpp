#include "commands/MinionCommands.hpp"

#include <stdexcept>
#include <string>
#include <system_error>

#include "tasks/ConcreteTasks.hpp"
#include "DebugLogger.hpp"
#include "Logger.hpp"
#include "transport/MasterProxy.hpp"

namespace ilrd::concrete
{

namespace
{

void LogCommandError(const std::string& command_name, const std::string& message,
                     Logger::Level level = Logger::Level::WARNING)
{
    Logger::Instance().Log(command_name + ": " + message, level);
}

void SafeSendReadResponse(const ReadTask& request, wire::StatusCode status,
                          const std::vector<std::uint8_t>& payload,
                          const char* context)
{
    try
    {
        GetActiveMinionRuntime().GetProxy().SendReadResponse(request, status, payload);
    }
    catch (const std::exception& error)
    {
        LogCommandError("ReadCommand",
                        std::string(context) + ": " + error.what(),
                        Logger::Level::ERROR);
    }
}

void SafeSendWriteResponse(const WriteTask& request, wire::StatusCode status,
                           const char* context)
{
    try
    {
        GetActiveMinionRuntime().GetProxy().SendWriteResponse(request, status);
    }
    catch (const std::exception& error)
    {
        LogCommandError("WriteCommand",
                        std::string(context) + ": " + error.what(),
                        Logger::Level::ERROR);
    }
}

void SafeSendFlushResponse(const FlushTask& request, wire::StatusCode status,
                           const char* context)
{
    try
    {
        GetActiveMinionRuntime().GetProxy().SendFlushResponse(request, status);
    }
    catch (const std::exception& error)
    {
        LogCommandError("FlushCommand",
                        std::string(context) + ": " + error.what(),
                        Logger::Level::ERROR);
    }
}

ICommand* CreateReadCommand()
{
    return new ReadCommand();
}

ICommand* CreateWriteCommand()
{
    return new WriteCommand();
}

ICommand* CreateFlushCommand()
{
    return new FlushCommand();
}

ICommand* CreateHeartbeatCommand()
{
    return new HeartbeatCommand();
}

} // namespace

std::unique_ptr<ICommand::PostTaskParams>
ReadCommand::Execute(SharedPtr<ITask> task)
{
    ReadTask* const request = dynamic_cast<ReadTask*>(task.operator->());
    if (nullptr == request)
    {
        LogCommandError("ReadCommand", "received non-ReadTask");
        return std::unique_ptr<PostTaskParams>();
    }

    try
    {
        ILRD_DEBUG_LOG("ReadCommand executing request_id=" +
                       request->GetRequestId().ToString() + " offset=" +
                       std::to_string(request->GetLogicalOffset()) + " length=" +
                       std::to_string(request->GetOperationLength()));
        MinionRuntime& runtime = GetActiveMinionRuntime();
        const std::vector<std::uint8_t> payload =
            runtime.GetStorage().Read(request->GetLogicalOffset(),
                                      request->GetOperationLength());
        SafeSendReadResponse(*request, wire::StatusCode::OK, payload,
                             "failed sending read success response");
    }
    catch (const std::out_of_range& error)
    {
        LogCommandError("ReadCommand", error.what());
        SafeSendReadResponse(*request, wire::StatusCode::OUT_OF_RANGE,
                             std::vector<std::uint8_t>(),
                             "failed sending read OUT_OF_RANGE response");
    }
    catch (const std::invalid_argument& error)
    {
        LogCommandError("ReadCommand", error.what());
        SafeSendReadResponse(*request, wire::StatusCode::BAD_LENGTH,
                             std::vector<std::uint8_t>(),
                             "failed sending read BAD_LENGTH response");
    }
    catch (const std::system_error& error)
    {
        LogCommandError("ReadCommand", error.what(), Logger::Level::ERROR);
        SafeSendReadResponse(*request, wire::StatusCode::IO_ERROR,
                             std::vector<std::uint8_t>(),
                             "failed sending read IO_ERROR response");
    }
    catch (const std::exception& error)
    {
        LogCommandError("ReadCommand", error.what(), Logger::Level::ERROR);
        SafeSendReadResponse(*request, wire::StatusCode::INTERNAL_ERROR,
                             std::vector<std::uint8_t>(),
                             "failed sending read INTERNAL_ERROR response");
    }

    return std::unique_ptr<PostTaskParams>();
}

std::unique_ptr<ICommand::PostTaskParams>
WriteCommand::Execute(SharedPtr<ITask> task)
{
    WriteTask* const request = dynamic_cast<WriteTask*>(task.operator->());
    if (nullptr == request)
    {
        LogCommandError("WriteCommand", "received non-WriteTask");
        return std::unique_ptr<PostTaskParams>();
    }

    try
    {
        ILRD_DEBUG_LOG("WriteCommand executing request_id=" +
                       request->GetRequestId().ToString() + " offset=" +
                       std::to_string(request->GetLogicalOffset()) + " length=" +
                       std::to_string(request->GetOperationLength()));
        if (request->GetData().size() != request->GetOperationLength())
        {
            throw std::invalid_argument(
                "WriteTask payload size does not match operation length");
        }

        MinionRuntime& runtime = GetActiveMinionRuntime();
        runtime.GetStorage().Write(request->GetLogicalOffset(), request->GetData());
        SafeSendWriteResponse(*request, wire::StatusCode::OK,
                              "failed sending write success response");
    }
    catch (const std::out_of_range& error)
    {
        LogCommandError("WriteCommand", error.what());
        SafeSendWriteResponse(*request, wire::StatusCode::OUT_OF_RANGE,
                              "failed sending write OUT_OF_RANGE response");
    }
    catch (const std::invalid_argument& error)
    {
        LogCommandError("WriteCommand", error.what());
        SafeSendWriteResponse(*request, wire::StatusCode::BAD_LENGTH,
                              "failed sending write BAD_LENGTH response");
    }
    catch (const std::system_error& error)
    {
        LogCommandError("WriteCommand", error.what(), Logger::Level::ERROR);
        SafeSendWriteResponse(*request, wire::StatusCode::IO_ERROR,
                              "failed sending write IO_ERROR response");
    }
    catch (const std::exception& error)
    {
        LogCommandError("WriteCommand", error.what(), Logger::Level::ERROR);
        SafeSendWriteResponse(*request, wire::StatusCode::INTERNAL_ERROR,
                              "failed sending write INTERNAL_ERROR response");
    }

    return std::unique_ptr<PostTaskParams>();
}

std::unique_ptr<ICommand::PostTaskParams>
FlushCommand::Execute(SharedPtr<ITask> task)
{
    FlushTask* const request = dynamic_cast<FlushTask*>(task.operator->());
    if (nullptr == request)
    {
        LogCommandError("FlushCommand", "received non-FlushTask");
        return std::unique_ptr<PostTaskParams>();
    }

    try
    {
        ILRD_DEBUG_LOG("FlushCommand executing request_id=" +
                       request->GetRequestId().ToString());
        MinionRuntime& runtime = GetActiveMinionRuntime();
        runtime.GetStorage().Flush();
        SafeSendFlushResponse(*request, wire::StatusCode::OK,
                              "failed sending flush success response");
    }
    catch (const std::out_of_range& error)
    {
        LogCommandError("FlushCommand", error.what());
        SafeSendFlushResponse(*request, wire::StatusCode::OUT_OF_RANGE,
                              "failed sending flush OUT_OF_RANGE response");
    }
    catch (const std::invalid_argument& error)
    {
        LogCommandError("FlushCommand", error.what());
        SafeSendFlushResponse(*request, wire::StatusCode::BAD_LENGTH,
                              "failed sending flush BAD_LENGTH response");
    }
    catch (const std::system_error& error)
    {
        LogCommandError("FlushCommand", error.what(), Logger::Level::ERROR);
        SafeSendFlushResponse(*request, wire::StatusCode::IO_ERROR,
                              "failed sending flush IO_ERROR response");
    }
    catch (const std::exception& error)
    {
        LogCommandError("FlushCommand", error.what(), Logger::Level::ERROR);
        SafeSendFlushResponse(*request, wire::StatusCode::INTERNAL_ERROR,
                              "failed sending flush INTERNAL_ERROR response");
    }

    return std::unique_ptr<PostTaskParams>();
}

std::unique_ptr<ICommand::PostTaskParams>
HeartbeatCommand::Execute(SharedPtr<ITask> task)
{
    HeartbeatTask* const request = dynamic_cast<HeartbeatTask*>(task.operator->());
    if (nullptr == request)
    {
        LogCommandError("HeartbeatCommand", "received non-HeartbeatTask");
        return std::unique_ptr<PostTaskParams>();
    }

    try
    {
        ILRD_DEBUG_LOG("HeartbeatCommand executing request_id=" +
                       request->GetRequestId().ToString() + " heartbeat_seq=" +
                       std::to_string(request->GetBody().heartbeat_seq));
        MinionRuntime& runtime = GetActiveMinionRuntime();
        wire::HeartbeatAckBodyV1 body;
        body.node_id = runtime.GetNodeId();
        body.acked_seq = request->GetBody().heartbeat_seq;
        body.accepted_state = runtime.GetHealthState();
        runtime.GetProxy().SendHeartbeatResponse(*request, wire::StatusCode::OK,
                                                 body);
    }
    catch (const std::exception& error)
    {
        LogCommandError("HeartbeatCommand", error.what(), Logger::Level::ERROR);
    }

    return std::unique_ptr<PostTaskParams>();
}

Framework::CommandMap BuildMinionCommandMap(MinionRuntime& runtime)
{
    SetActiveMinionRuntime(runtime);
    ILRD_DEBUG_LOG("BuildMinionCommandMap activated runtime");

    Framework::CommandMap command_map;
    command_map[READ_COMMAND_KEY] = &CreateReadCommand;
    command_map[WRITE_COMMAND_KEY] = &CreateWriteCommand;
    command_map[FLUSH_COMMAND_KEY] = &CreateFlushCommand;
    command_map[HEARTBEAT_COMMAND_KEY] = &CreateHeartbeatCommand;
    ILRD_DEBUG_LOG("BuildMinionCommandMap registered minion command set");
    return command_map;
}

} // namespace ilrd::concrete
