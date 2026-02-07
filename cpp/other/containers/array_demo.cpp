#include <array>
#include <iostream>
#include <stdexcept>

void print_array(const std::array<int, 5>& a, const char* label)
{
    std::cout << label << ": ";
    for (std::array<int, 5>::const_iterator it = a.begin(); it != a.end(); ++it)
    {
        std::cout << *it << ' ';
    }
    std::cout << '\n';
}

int main()
{
    std::array<int, 5> a = {{1, 2, 3, 4, 5}};
    std::array<int, 5> b;

    std::cout << "[construct]\n";
    print_array(a, "a");

    std::cout << "[capacity]\n";
    std::cout << "size=" << a.size() << " empty=" << a.empty() << '\n';

    std::cout << "[element access]\n";
    std::cout << "a[2]=" << a[2] << " front=" << a.front() << " back=" << a.back() << '\n';

    try
    {
        std::cout << "a.at(9)=" << a.at(9) << '\n';
    }
    catch (const std::out_of_range& e)
    {
        std::cout << "at(9) threw: " << e.what() << '\n';
    }

    std::cout << "[fill/swap]\n";
    b.fill(8);
    print_array(b, "b before swap");
    a.swap(b);
    print_array(a, "a after swap");
    print_array(b, "b after swap");

    std::cout << "[iterators]\n";
    for (std::array<int, 5>::iterator it = a.begin(); it != a.end(); ++it)
    {
        *it += 1;
    }
    print_array(a, "a incremented");

    return 0;
}
