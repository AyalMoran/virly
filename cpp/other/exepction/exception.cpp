#include <iostream>
#include <csignal>
#include <cstdlib>
void Foo()
{
    throw 7;
}
int main()
{

    Foo();
}