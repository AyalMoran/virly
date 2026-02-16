#include "Net/MessageBuilder.hpp"

#include <sstream>

std::string MessageBuilder::BuildPing(int sequence,
                                      const std::string& customMessage)
{
    std::ostringstream oss;
    oss << "ping:" << sequence;
    if (!customMessage.empty())
    {
        oss << ":" << customMessage;
    }
    return oss.str();
}

std::string MessageBuilder::BuildPong(const std::string& inputMessage)
{
    return std::string("pong:") + inputMessage;
}
