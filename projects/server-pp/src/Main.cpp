#include "Logger.hpp"
#include "Server.hpp"

#include <stdexcept>

int main()
{
    Endpoint endpoint("0.0.0.0", 8080);

    Server server;
    try
    {
        server.Run();
    }
    catch (const std::runtime_error& ex)
    {
        LOG_ERROR(ex.what());
    }
    catch (const std::exception& ex)
    {
        LOG_ERROR(ex.what());
    }
    catch (...)
    {
        LOG_ERROR("Unknown exception caught in main");
    }
    return 0;
}