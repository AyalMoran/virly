#include "App/UdpPingClient.hpp"

#include "App/CommandLineOptions.hpp"
#include "Net/Logger.hpp"
#include "Net/MessageBuilder.hpp"
#include "Net/SignalManager.hpp"
#include "Net/UdpSocket.hpp"

#include <sstream>
#include <unistd.h>

int UdpPingClient::Run(int argc, char** argv)
{
    const std::string USAGE =
        "Usage: UdpPingClient [--bind-host HOST] [--bind-port PORT] "
        "[--target-host HOST] [--target-port PORT] "
        "[--count N] [--interval-ms MS] [--message TEXT]\n"
        "Defaults: bind=0.0.0.0:0 target=127.0.0.1:5001 count=5 "
        "interval-ms=1000";
    CommandLineOptions::PrintHelpIfRequested(argc, argv, USAGE);

    Endpoint bindEndpoint(
        CommandLineOptions::GetString(argc, argv, "--bind-host", "0.0.0.0"),
        static_cast<unsigned short>(
            CommandLineOptions::GetInt(argc, argv, "--bind-port", 0)));

    Endpoint targetEndpoint(
        CommandLineOptions::GetString(argc, argv, "--target-host", "127.0.0.1"),
        static_cast<unsigned short>(
            CommandLineOptions::GetInt(argc, argv, "--target-port", 5001)));

    const int count = CommandLineOptions::GetInt(argc, argv, "--count", 5);
    const int intervalMs =
        CommandLineOptions::GetInt(argc, argv, "--interval-ms", 1000);
    const std::string customMessage =
        CommandLineOptions::GetString(argc, argv, "--message", "");

    UdpSocket socket;
    socket.EnableReuseAddress();
    socket.Bind(bindEndpoint);
    socket.Connect(targetEndpoint);

    SignalManager::InstallHandlers();

    int sequence = 1;
    for (sequence = 1; sequence <= count && !SignalManager::IsStopRequested();
         ++sequence)
    {
        std::string ping = MessageBuilder::BuildPing(sequence, customMessage);
        socket.Send(ping);
        LOG_INFO("Sent: " + ping);

        std::string reply;
        socket.Receive(reply);
        LOG_INFO("Received: " + reply);

        if (sequence < count)
        {
            usleep(static_cast<useconds_t>(intervalMs * 1000));
        }
    }

    LOG_INFO("UDP ping client completed");
    return 0;
}
