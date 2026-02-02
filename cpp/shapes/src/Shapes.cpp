/*************************************
 * Shapes.cpp
 * Author: Ayal Moran
 * Reviewer: Roi .C
 * Date: 02-02-2026
 */

#include "Shapes.hpp"
#include <iostream>
 
namespace ilrd
{
/**
 * @brief Shape constructor initializes position coordinates.
 * @param pos_x X coordinate (default: 0).
 * @param pos_y Y coordinate (default: 0).
 */
Shape::Shape(int pos_x, int pos_y) : pos_x(pos_x), pos_y(pos_y)
{
    std::cout << "Shape ctor" << std::endl;
}

/**
 * @brief Shape copy constructor copies position from another Shape.
 * @param other Reference to the Shape to copy from.
 */
Shape::Shape(const Shape& other) : pos_x(other.pos_x), pos_y(other.pos_y)
{
    std::cout << "Shape copy ctor" << std::endl;
}


/**
 * @brief Default Shape draw implementation (overridden by derived).
 */
void Shape::Draw() const
{
    std::cout << "Shape draw" << std::endl;
}
} // namespace ilrd
