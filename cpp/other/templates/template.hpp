#include <cstddef>

template <typename T, typename U>
T Max(T t1, U u2)
{
    std::cout << "From template.hpp\n";
    
    return (t1 > u2) ? t1 : u2;
}


