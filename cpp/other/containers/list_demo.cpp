#include <iostream>
#include <list>

void print_list(const std::list<int>& li, const char* label)
{
    std::cout << label << ": ";
    for (std::list<int>::const_iterator it = li.begin(); it != li.end(); ++it)
    {
        std::cout << *it << ' ';
    }
    std::cout << "(size=" << li.size() << ")\n";
}

int main()
{
    std::list<int> li;

    std::cout << "[push/pop both ends]\n";
    li.push_back(10);
    li.push_back(20);
    li.push_front(5);
    li.push_front(1);
    print_list(li, "after pushes");
    li.pop_front();
    li.pop_back();
    print_list(li, "after pops");

    std::cout << "[insert/erase]\n";
    std::list<int>::iterator it = li.begin();
    li.insert(it, 99);
    print_list(li, "after insert at begin");
    it = li.begin();
    ++it;
    li.erase(it);
    print_list(li, "after erase second");

    std::cout << "[remove/unique]\n";
    li.push_back(10);
    li.push_back(10);
    li.push_back(30);
    print_list(li, "before remove(10)");
    li.remove(10);
    print_list(li, "after remove(10)");

    std::list<int> dup;
    dup.push_back(1);
    dup.push_back(1);
    dup.push_back(2);
    dup.push_back(2);
    dup.push_back(3);
    print_list(dup, "dup before unique");
    dup.unique();
    print_list(dup, "dup after unique");

    std::cout << "[sort/reverse]\n";
    std::list<int> order;
    order.push_back(4);
    order.push_back(1);
    order.push_back(3);
    order.push_back(2);
    print_list(order, "before sort");
    order.sort();
    print_list(order, "after sort");
    order.reverse();
    print_list(order, "after reverse");

    std::cout << "[splice/merge]\n";
    std::list<int> x;
    x.push_back(1);
    x.push_back(3);
    x.push_back(5);
    std::list<int> y;
    y.push_back(2);
    y.push_back(4);
    y.push_back(6);

    std::list<int> moved;
    moved.push_back(50);
    moved.push_back(60);
    print_list(x, "x before splice");
    print_list(moved, "moved before splice");
    std::list<int>::iterator splice_pos = x.begin();
    ++splice_pos;
    x.splice(splice_pos, moved);
    print_list(x, "x after splice");
    print_list(moved, "moved after splice (empty)");

    x.sort();
    y.sort();
    x.merge(y);
    print_list(x, "x after merge");
    print_list(y, "y after merge (empty)");

    std::cout << "[swap/clear]\n";
    std::list<int> other(3, 7);
    x.swap(other);
    print_list(x, "x after swap");
    print_list(other, "other after swap");
    other.clear();
    print_list(other, "other after clear");

    return 0;
}
