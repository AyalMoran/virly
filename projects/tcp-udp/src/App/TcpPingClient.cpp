#include "App/TcpPingClient.hpp"

#include "App/CommandLineOptions.hpp"
#include "Net/Logger.hpp"
#include "Net/MessageBuilder.hpp"
#include "Net/SignalManager.hpp"
#include "Net/TcpSocket.hpp"

#include <unistd.h>

int TcpPingClient::Run(int argc, char** argv)
{
    const std::string USAGE =
        "Usage: TcpPingClient [--target-host HOST] [--target-port PORT] "
        "[--count N] [--interval-ms MS] [--message TEXT]\n"
        "Defaults: target=127.0.0.1:5002 count=5 interval-ms=1000";
    CommandLineOptions::PrintHelpIfRequested(argc, argv, USAGE);

    Endpoint targetEndpoint(
        CommandLineOptions::GetString(argc, argv, "--target-host", "127.0.0.1"),
        static_cast<unsigned short>(
            CommandLineOptions::GetInt(argc, argv, "--target-port", 5002)));

    const int count = CommandLineOptions::GetInt(argc, argv, "--count", 5);
    const int intervalMs =
        CommandLineOptions::GetInt(argc, argv, "--interval-ms", 1000);
    const std::string customMessage =
        CommandLineOptions::GetString(argc, argv, "--message", "");

    TcpSocket client;
    client.Connect(targetEndpoint);

    SignalManager::InstallHandlers();

    int sequence = 1;
    for (sequence = 1; sequence <= count && !SignalManager::IsStopRequested();
         ++sequence)
    {
        std::string ping = MessageBuilder::BuildPing(sequence, customMessage);
        client.SendLine(ping);
        LOG_INFO("Sent: " + ping);

        std::string reply;
        if (!client.ReceiveLine(reply))
        {
            LOG_INFO("Server disconnected");
            break;
        }

        LOG_INFO("Received: " + reply);

        if (sequence < count)
        {
            usleep(static_cast<useconds_t>(intervalMs * 1000));
        }
    }

    LOG_INFO("TCP ping client completed");
    return 0;
}
