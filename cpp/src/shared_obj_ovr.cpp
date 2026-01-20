#include <iostream>
#include <string>

#include "shared_obj_ovr.h"

void foo(int x)
{
    std::cout << "foo(int)\n";
}

void foo(double x)
{
    std::cout << "foo(double)\n";
}

void foo(long x)
{
    std::cout << "foo(long)\n";
}

void foo(char* x)
{
    std::cout << "foo(char*)\n";
}