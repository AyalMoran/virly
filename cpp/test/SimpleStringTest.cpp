#include <iostream>
#include "SimpleString.hpp"

void Foo(String s)
{
    std::cout << "==== " << std::endl;
    std::cout << "In Foo():" << std::endl;
    std::cout << "`s` was: " << s << std::endl;
    s = "def";
    std::cout << "`s` is now: " << s << std::endl;
    std::cout << "exiting Foo() " << std::endl;
    std::cout << "==== " << std::endl;
}

void PrintString(const String& s)
{
    std::cout << "Printing String: " << s << std::endl;
}

String Bla()
{
    return "efg";
}

int main()
{
    String s("abc");

    assert(strcmp(s.Cstr(), "abc") == 0);
    assert(s.Length() == 3);
    
    String s2(s);
    assert(strcmp(s2.Cstr(), "abc") == 0);
    assert(s2.Length() == 3);

    String s1;
    assert(strcmp(s1.Cstr(), "") == 0);
    assert(s1.Length() == 0);

    s1 = s;
    assert(s.Length() == 3);
    assert(s1.Length() == 3);

    Foo(s);
    PrintString(s);
    
    String tmp = Bla();
    assert(strcmp(tmp.Cstr(), "efg") == 0);

}