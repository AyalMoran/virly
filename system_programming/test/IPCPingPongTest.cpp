/**************************************************************
 * File    : IPCPingPongTest.c
 * Author  : Ayal Moran
 * Reviewer:
 * Date    :
 **************************************************************/

#include <cassert>
#include <cstdlib>
#include <iostream>
#include <cstring>

#include "IPCPingPong.hpp"

/******************************************************
 * START OF ACTUAL TESTS
 ******************************************************/

const std::size_t THOUSAND = 1000;
const std::size_t MILLION = 1000000;
const std::size_t NUM_OF_ROUNDS = 999 * MILLION;

int main(int argc, char** argv)
{
    if(argc < 2)
    {
        std::cout << "Usage: ./IPCPingPong <Function>" << std::endl;
        return 1;
    }

    if(0 == strcmp(argv[1], "SemPingPongFunc"))
    {
        SemPingPongFunc(argv, NUM_OF_ROUNDS);
    }
    else if (0 == strcmp(argv[1], "PipePingPongFunc"))
    {
        PipePingPongFunc(NUM_OF_ROUNDS);
    }



    return 0;
}
