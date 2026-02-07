#include <deque>
#include <iostream>

void print_deque(const std::deque<int>& d, const char* label)
{
    std::cout << label << ": ";
    for (std::deque<int>::const_iterator it = d.begin(); it != d.end(); ++it)
    {
        std::cout << *it << ' ';
    }
    std::cout << "(size=" << d.size() << ")\n";
}

int main()
{
    std::deque<int> d;

    std::cout << "[push both ends]\n";
    d.push_back(10);
    d.push_back(20);
    d.push_front(5);
    d.push_front(1);
    print_deque(d, "after pushes");

    std::cout << "[random access]\n";
    std::cout << "d[1]=" << d[1] << " front=" << d.front() << " back=" << d.back() << '\n';

    std::cout << "[insert/erase middle]\n";
    d.insert(d.begin() + 2, 99);
    print_deque(d, "after insert");
    d.erase(d.begin() + 3);
    print_deque(d, "after erase");

    std::cout << "[pop both ends]\n";
    d.pop_front();
    d.pop_back();
    print_deque(d, "after pops");

    std::cout << "[assign/swap/clear]\n";
    std::deque<int> other(3, 7);
    print_deque(other, "other");
    d.swap(other);
    print_deque(d, "d after swap");
    print_deque(other, "other after swap");
    other.clear();
    print_deque(other, "other after clear");

    return 0;
}
