/*************************************
 * Circle.cpp
 * Author: Ayal Moran
 * Reviewer: Roi .C
 * Date: 02-02-2026
 */

#include "Circle.hpp"
#include "Shapes.hpp"
#include <iostream>

namespace ilrd
{
/**
 * @brief Circle constructor initializes radius and position.
 * @param radius The radius of the circle.
 * @param pos_x X coordinate of center (default: 0).
 * @param pos_y Y coordinate of center (default: 0).
 */
Circle::Circle(int radius, int pos_x, int pos_y)
    : Shape(pos_x, pos_y), m_radius(radius)
{
    std::cout << "Circle ctor" << std::endl;
}

/**
 * @brief Circle copy constructor copies radius and position.
 * @param other Reference to the Circle to copy from.
 */
Circle::Circle(const Circle& other) : Shape(other), m_radius(other.m_radius)
{
    std::cout << "Circle copy ctor" << std::endl;
}

/**
 * @brief Circle assignment operator assigns radius and position.
 * @param other Reference to the Circle to assign from.
 * @return Reference to this Circle after assignment.
 */
Circle& Circle::operator=(const Circle& other)
{
    std::cout << "Circle assignment" << std::endl;
    this->m_radius = other.m_radius;
    Shape::operator=(other);

    return *this;
}

/**
 * @brief Draw the circle at its position.
 */
void Circle::Draw() const
{
    std::cout << "Circle draw at (" << GetPosX() << ", " << GetPosY() << ")"
              << std::endl;
}
} // namespace ilrd
