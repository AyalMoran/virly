#include "App/UdpPingClient.hpp"
#include "Net/Logger.hpp"

#include <exception>

int main(int argc, char** argv)
{
    try
    {
        UdpPingClient app;
        return app.Run(argc, argv);
    }
    catch (const std::exception& ex)
    {
        LOG_ERROR(ex.what());
        return 1;
    }
}
