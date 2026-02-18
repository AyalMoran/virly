
#include "App/CommandLineOptions.hpp"
#include "App/TcpPingServer.hpp"

#include "Net/Logger.hpp"
#include "Net/MessageBuilder.hpp"
#include "Net/SignalManager.hpp"
#include "Net/TcpSocket.hpp"

#include <cerrno>
#include <pthread.h>
#include <sstream>
#include <vector>

namespace
{
struct ClientThreadContext
{
    int ClientFd;
    Endpoint Peer;
};

void* RunClientLoop(void* thread_ctx)
{
    ClientThreadContext* context =
        reinterpret_cast<ClientThreadContext*>(thread_ctx);

    try
    {
        TcpSocket client(context->ClientFd);

        std::ostringstream startLog;
        startLog << "TCP client thread started for " << context->Peer.GetHost()
                 << ":" << context->Peer.GetPort();
        LOG_INFO(startLog.str());

        while (!SignalManager::IsStopRequested())
        {
            std::string line;
            if (!client.ReceiveLine(line))
            {
                break;
            }

            LOG_INFO("Received from client: " + line);
            client.SendLine(MessageBuilder::BuildPong(line));
        }

        std::ostringstream stopLog;
        stopLog << "TCP client disconnected " << context->Peer.GetHost() << ":"
                << context->Peer.GetPort();
        LOG_INFO(stopLog.str());
    }
    catch (const std::exception& ex)
    {
        LOG_ERROR(std::string("Client thread error: ") + ex.what());
    }

    delete context;
    return NULL;
}
} // namespace

int TcpPingServer::Run(int argc, char** argv)
{
    const std::string USAGE =
        "Usage: TcpPingServer [--bind-host HOST] [--bind-port PORT] [--backlog "
        "N]\n"
        "Defaults: --bind-host 0.0.0.0 --bind-port 5002 --backlog 10";
    CommandLineOptions::PrintHelpIfRequested(argc, argv, USAGE);

    Endpoint bindEndpoint(
        CommandLineOptions::GetString(argc, argv, "--bind-host", "0.0.0.0"),
        static_cast<unsigned short>(
            CommandLineOptions::GetInt(argc, argv, "--bind-port", 5002)));
    const int backlog = CommandLineOptions::GetInt(argc, argv, "--backlog", 10);

    TcpSocket listener;
    listener.EnableReuseAddress();
    listener.Bind(bindEndpoint);
    listener.Listen(backlog);

    SignalManager::InstallHandlers();

    std::ostringstream startMessage;
    startMessage << "TCP ping server listening on " << bindEndpoint.GetHost()
                 << ":" << bindEndpoint.GetPort();
    LOG_INFO(startMessage.str());

    std::vector<pthread_t> threadIds;

    while (!SignalManager::IsStopRequested())
    {
        try
        {
            Endpoint peer;
            int clientFd = listener.Accept(peer);

            ClientThreadContext* context = new ClientThreadContext();
            context->ClientFd = clientFd;
            context->Peer = peer;

            pthread_t threadId;
            int createResult =
                pthread_create(&threadId, NULL, &RunClientLoop, context);
            if (createResult != 0)
            {
                delete context;
                throw std::runtime_error("pthread_create() failed");
            }

            threadIds.push_back(threadId);
        }
        catch (const std::exception& ex)
        {
            if (SignalManager::IsStopRequested() || errno == EINTR)
            {
                break;
            }
            LOG_ERROR(std::string("Accept loop error: ") + ex.what());
        }
    }

    std::vector<pthread_t>::iterator it = threadIds.begin();
    for (; it != threadIds.end(); ++it)
    {
        pthread_join(*it, NULL);
    }

    LOG_INFO("TCP ping server stopping");
    return 0;
}
