#include "App/UdpBroadcastListener.hpp"

#include "App/CommandLineOptions.hpp"
#include "Net/Logger.hpp"
#include "Net/SignalManager.hpp"
#include "Net/UdpSocket.hpp"

#include <sstream>

int UdpBroadcastListener::Run(int argc, char** argv)
{
    const std::string USAGE =
        "Usage: UdpBroadcastListener [--bind-host HOST] [--bind-port PORT]\n"
        "Defaults: --bind-host 0.0.0.0 --bind-port 5003";
    CommandLineOptions::PrintHelpIfRequested(argc, argv, USAGE);

    Endpoint bindEndpoint(
        CommandLineOptions::GetString(argc, argv, "--bind-host", "0.0.0.0"),
        static_cast<unsigned short>(
            CommandLineOptions::GetInt(argc, argv, "--bind-port", 5003)));

    UdpSocket socket;
    socket.EnableReuseAddress();
    socket.Bind(bindEndpoint);

    SignalManager::InstallHandlers();

    std::ostringstream startMessage;
    startMessage << "UDP broadcast listener on " << bindEndpoint.GetHost()
                 << ":" << bindEndpoint.GetPort();
    LOG_INFO(startMessage.str());

    while (!SignalManager::IsStopRequested())
    {
        try
        {
            std::string message;
            Endpoint sender;
            socket.ReceiveFrom(message, sender);

            std::ostringstream inLog;
            inLog << "Received broadcast from " << sender.GetHost() << ":"
                  << sender.GetPort() << " message='" << message << "'";
            LOG_INFO(inLog.str());
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

    LOG_INFO("UDP broadcast listener stopping");
    return 0;
}
