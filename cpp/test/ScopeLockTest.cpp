#include <algorithm>
#include <iostream>
#include <mutex>
#include <thread>
#include <vector>

#include "ScopeLock.hpp"

std::mutex g_mutex;

void Incne(int& num)
{
    ScopeLock<std::mutex> locking(g_mutex);
    ++num;
}

void IncOne(std::vector<int>& numbers)
{
    std::for_each(numbers.begin(), numbers.end(), Incne);
}

const int NUM_THREADS = 16;

int main(int argc, char** argv)
{
    std::vector<std::thread> threads(NUM_THREADS);
    std::vector<int> numbers(100000, 0);

    for (std::size_t i = 0; i < NUM_THREADS; ++i)
    {
        threads[i] = std::thread(IncOne, std::ref(numbers));
    }

    for (std::size_t i = 0; i < NUM_THREADS; ++i)
    {
        threads[i].join();
    }

    for (std::size_t i = 0; i < numbers.size(); ++i)
    {
        if (NUM_THREADS != numbers[i])
        {
            std::cout << "Test Failed." << std::endl;
            return 1;
        }
    }

    std::cout << "Test Passed." << std::endl;
    return 0;
}
