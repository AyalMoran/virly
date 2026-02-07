#include <iostream>
#include <string>
#include <vector>

void print_vector(const std::vector<int>& v, const char* label)
{
    std::cout << label << ": ";
    for (std::vector<int>::const_iterator it = v.begin(); it != v.end(); ++it)
    {
        std::cout << *it << ' ';
    }
    std::cout << "(size=" << v.size() << ", cap=" << v.capacity() << ")\n";
}

int main()
{
    std::vector<int> v;

    std::cout << "[construct/capacity growth]\n";
    print_vector(v, "empty");
    for (int i = 1; i <= 8; ++i)
    {
        v.push_back(i * 10);
        std::cout << "push_back(" << i * 10 << ") size=" << v.size() << " cap=" << v.capacity() << '\n';
    }

    std::cout << "[reserve/resize]\n";
    v.reserve(20);
    print_vector(v, "after reserve(20)");
    v.resize(10, -1);
    print_vector(v, "after resize(10,-1)");

    std::cout << "[element access]\n";
    std::cout << "v[0]=" << v[0] << " front=" << v.front() << " back=" << v.back() << '\n';

    std::cout << "[insert/erase]\n";
    v.insert(v.begin() + 2, 99);
    print_vector(v, "after insert at 2");
    v.erase(v.begin() + 3);
    print_vector(v, "after erase at 3");

    std::cout << "[assign/pop_back]\n";
    std::vector<int> other;
    other.assign(4, 7);
    print_vector(other, "other assigned");
    other.pop_back();
    print_vector(other, "other pop_back");

    std::cout << "[swap/clear]\n";
    v.swap(other);
    print_vector(v, "v after swap");
    print_vector(other, "other after swap");
    other.clear();
    print_vector(other, "other after clear");

    std::cout << "[vector<string>]\n";
    std::vector<std::string> names;
    names.push_back("Ada");
    names.push_back("Bjarne");
    names.push_back("Herb");
    for (std::vector<std::string>::const_iterator it = names.begin(); it != names.end(); ++it)
    {
        std::cout << *it << ' ';
    }
    std::cout << '\n';

    return 0;
}
