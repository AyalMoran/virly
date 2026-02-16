#include "App/UdpBroadcastSender.hpp"

#include "App/CommandLineOptions.hpp"
#include "Net/Logger.hpp"
#include "Net/SignalManager.hpp"
#include "Net/UdpSocket.hpp"

#include <sstream>
#include <unistd.h>

int UdpBroadcastSender::Run(int argc, char** argv)
{
    const std::string USAGE =
        "Usage: UdpBroadcastSender [--bind-host HOST] [--bind-port PORT] "
        "[--target-host HOST] [--target-port PORT] "
        "[--count N] [--interval-ms MS] [--message TEXT]\n"
        "Defaults: bind=0.0.0.0:0 target=255.255.255.255:5003 count=5 "
        "interval-ms=1000 message=broadcast";
    CommandLineOptions::PrintHelpIfRequested(argc, argv, USAGE);

    Endpoint bindEndpoint(
        CommandLineOptions::GetString(argc, argv, "--bind-host", "0.0.0.0"),
        static_cast<unsigned short>(
            CommandLineOptions::GetInt(argc, argv, "--bind-port", 0)));

    Endpoint targetEndpoint(
        CommandLineOptions::GetString(argc, argv, "--target-host",
                                      "255.255.255.255"),
        static_cast<unsigned short>(
            CommandLineOptions::GetInt(argc, argv, "--target-port", 5003)));

    const int count = CommandLineOptions::GetInt(argc, argv, "--count", 5);
    const int intervalMs =
        CommandLineOptions::GetInt(argc, argv, "--interval-ms", 1000);
    const std::string customMessage =
        CommandLineOptions::GetString(argc, argv, "--message", "broadcast");

    UdpSocket socket;
    socket.EnableReuseAddress();
    socket.EnableBroadcast();
    socket.Bind(bindEndpoint);

    SignalManager::InstallHandlers();

    int i = 1;
    for (i = 1; i <= count && !SignalManager::IsStopRequested(); ++i)
    {
        std::ostringstream payload;
        payload << "broadcast:" << i << ":" << customMessage;
        socket.SendTo(targetEndpoint, payload.str());
        LOG_INFO("Sent: " + payload.str());

        if (i < count)
        {
            usleep(static_cast<useconds_t>(intervalMs * 1000));
        }
    }

    LOG_INFO("UDP broadcast sender completed");
    return 0;
}
