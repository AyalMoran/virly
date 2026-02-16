#include "App/TcpPingServer.hpp"
#include "Net/Logger.hpp"

#include <exception>

int main(int argc, char** argv)
{
    try
    {
        TcpPingServer app;
        return app.Run(argc, argv);
    }
    catch (const std::exception& ex)
    {
        LOG_ERROR(ex.what());
        return 1;
    }
}
