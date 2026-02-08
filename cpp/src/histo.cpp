#include <map>
#include <vector>
#include <string>
#include <iostream>

int main()
{
    std::map<std::string, int> map;
    std::vector<std::string> lines_vec;
    std::string line;
    size_t i = 0;
    while(std::getline(std::cin, line) && line != ".")
    {
        if(map.find(line) == map.end())
        {
            map.insert(std::make_pair(line, 1));
            lines_vec.push_back(line);
        }
        else
        {
            map.at(line)++;
        }
    }

    while(i < lines_vec.size())
    {
        line = lines_vec[i];
        
        if(map.at(line) > 1)
        {
            std::cout << map.at(line) << " X " << line << std::endl;
        }
        else
        {
            std::cout << line << std::endl;
        }
        ++i;
    }
}
