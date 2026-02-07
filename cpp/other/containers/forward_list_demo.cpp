#include <forward_list>
#include <iostream>

void print_forward_list(const std::forward_list<int>& fl, const char* label)
{
    std::cout << label << ": ";
    for (std::forward_list<int>::const_iterator it = fl.begin(); it != fl.end(); ++it)
    {
        std::cout << *it << ' ';
    }
    std::cout << '\n';
}

int main()
{
    std::forward_list<int> fl;

    std::cout << "[push_front/pop_front]\n";
    fl.push_front(30);
    fl.push_front(20);
    fl.push_front(10);
    print_forward_list(fl, "after push_front");
    fl.pop_front();
    print_forward_list(fl, "after pop_front");

    std::cout << "[insert_after/erase_after]\n";
    std::forward_list<int>::iterator pos = fl.before_begin();
    fl.insert_after(pos, 5);
    print_forward_list(fl, "after insert_after(before_begin,5)");
    pos = fl.begin();
    fl.insert_after(pos, 15);
    print_forward_list(fl, "after insert_after(begin,15)");
    fl.erase_after(pos);
    print_forward_list(fl, "after erase_after(begin)");

    std::cout << "[remove/reverse]\n";
    fl.push_front(20);
    fl.push_front(40);
    print_forward_list(fl, "before remove(20)");
    fl.remove(20);
    print_forward_list(fl, "after remove(20)");
    fl.reverse();
    print_forward_list(fl, "after reverse");

    std::cout << "[sort/merge]\n";
    std::forward_list<int> a;
    a.push_front(9);
    a.push_front(5);
    a.push_front(1);
    a.sort();

    std::forward_list<int> b;
    b.push_front(8);
    b.push_front(4);
    b.push_front(2);
    b.sort();

    print_forward_list(a, "a sorted");
    print_forward_list(b, "b sorted");
    a.merge(b);
    print_forward_list(a, "a after merge");
    print_forward_list(b, "b after merge (empty)");

    return 0;
}
