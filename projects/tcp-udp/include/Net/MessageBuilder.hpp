#ifndef NET_MESSAGE_CODEC_HPP
#define NET_MESSAGE_CODEC_HPP

#include <string>

class MessageBuilder
{
  public:
    static std::string BuildPing(int sequence,
                                 const std::string& customMessage);
    static std::string BuildPong(const std::string& inputMessage);
};

#endif
