#include <iostream>

#include "SimpleString.hpp"

void Foo(String* s)
{
    *s = "def";
    std::cout << *s << std::endl;
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
    std::cout << "s is:" << s << std::endl;
    std::cout << "s length is " << s.Length() << std::endl;
    
    String s2(s);
    std::cout << "s2 is:" << s2 << std::endl;
    std::cout << "s2 length is " << s2.Length() << std::endl;
    String s1;
    std::cout << "s1 is:" << s1 << std::endl;
    std::cout << "s1 length is " << s1.Length() << std::endl;

    s1 = s;
    std::cout << "s length is " << s.Length() << std::endl;
    std::cout << "s1 length is " << s1.Length() << std::endl;

    Foo(&s);
    PrintString(s);
    
    String tmp = Bla();
    std::cout << tmp << std::endl;

}