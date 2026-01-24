#include <iostream>
#define NAME useless

namespace NAME
{
    unsigned int g_wasteful[400];
    extern int & n0there;   // [uncertain: identifier spelling]
    void Foo() { std::cout << "useless::Foo called" << std::endl; }

    namespace wasteoftyme
    {
        void Foo() {std::cout << "useless::wasteoftyme::Foo called" << std::endl;}
    } //namespace wasteoftyme
}//namespace useless

namespace stupid
{
    void Foo() { std::cout << "stupid::Foo called" << std::endl;}
    void Bar() {std::cout << "Bar called" << std::endl;}
    void DoNothing(unsigned int) { std::cout << "stupid::DoNothing called" << std::endl; }
} //namespace stupid

namespace useless
{
    void DoNothing(int) { std::cout << "useless::DoNothing called" << std::endl; }
} //namespace useless

using namespace useless;

void DoStuff()
{
    stupid::Bar();
    stupid::Foo();
    using stupid::Foo;
    Foo();
    DoNothing(g_wasteful[3] + 1);
}

void Foo() {}

using namespace stupid;


namespace comeon = useless::wasteoftyme;

void DoMoreStuff()
{
    comeon::Foo();
    //Foo(); //try uncommenting this line, solve the error
    Bar(); //Why doesn't this line create an error?
    DoNothing(g_wasteful[3] + 1);
}

namespace useless
{
    void DoUselessStuff()
    {
        DoNothing(g_wasteful[3] + 1);
    }
}//namespace useless

int main()
{
    DoStuff();
    DoMoreStuff();
    useless::DoUselessStuff();
    return 0;
}