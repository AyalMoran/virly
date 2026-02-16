#include "App/UdpPingServer.hpp"

#include "App/CommandLineOptions.hpp"
#include "Net/Logger.hpp"
#include "Net/MessageBuilder.hpp"
#include "Net/SignalManager.hpp"
#include "Net/UdpSocket.hpp"

#include <sstream>

int UdpPingServer::Run(int argc, char** argv)
{
    const std::string USAGE =
        "Usage: UdpPingServer [--bind-host HOST] [--bind-port PORT]\n"
        "Defaults: --bind-host 0.0.0.0 --bind-port 5001";
    CommandLineOptions::PrintHelpIfRequested(argc, argv, USAGE);

    Endpoint bindEndpoint(
        CommandLineOptions::GetString(argc, argv, "--bind-host", "0.0.0.0"),
        static_cast<unsigned short>(
            CommandLineOptions::GetInt(argc, argv, "--bind-port", 5001)));

    UdpSocket socket;
    socket.EnableReuseAddress();
    socket.Bind(bindEndpoint);

    SignalManager::InstallHandlers();

    std::ostringstream startMessage;
    startMessage << "UDP ping server listening on " << bindEndpoint.GetHost()
                 << ":" << bindEndpoint.GetPort();
    LOG_INFO(startMessage.str());

    while (!SignalManager::IsStopRequested())
    {
        try
        {
            std::string message;
            Endpoint sender;
            int received = socket.ReceiveFrom(message, sender);

            std::ostringstream inLog;
            inLog << "Received " << received << " bytes from "
                  << sender.GetHost() << ":" << sender.GetPort() << " message='"
                  << message << "'";
            LOG_INFO(inLog.str());

            std::string reply = MessageBuilder::BuildPong(message);
            socket.SendTo(sender, reply);
        }
        catch (const std::exception&)
        {
            if (SignalManager::IsStopRequested())
            {
                break;
            }
            throw;
        }
    }

    LOG_INFO("UDP ping server stopping");
    return 0;
}
