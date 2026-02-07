#include <map>
#include <queue>
#include <string>
#include <iostream>

int main()
{
    std::map<std::string, int> map;
    std::queue<std::string> lines_queue;
    std::string line;
    
    while(std::getline(std::cin, line) && line != ".")
    {
        if(map.find(line) == map.end())
        {
            map.insert(std::make_pair(line, 1));
            lines_queue.push(line);
        }
        else
        {
            map.at(line)++;
        }
    }

    while(!lines_queue.empty())
    {
        line = lines_queue.front();
        lines_queue.pop();
        if(map.at(line) > 1)
        {
            std::cout << map.at(line) << " X " << line << std::endl;
        }
        else
        {
            std::cout << line << std::endl;
        }
    }
}