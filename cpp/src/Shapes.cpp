#include "Shapes.hpp"
#include <iostream>
 
namespace ilrd
{
Shape::Shape(int pos_x, int pos_y) : pos_x(pos_x), pos_y(pos_y)
{
    std::cout << "Shape ctor" << std::endl;
}

Shape::Shape(const Shape& other) : pos_x(other.pos_x), pos_y(other.pos_y)
{
    std::cout << "Shape copy ctor" << std::endl;
}

void Shape::Draw() const
{
    std::cout << "Shape draw" << std::endl;
}
} // namespace ilrd
