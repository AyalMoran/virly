/*************************************
 * Rectangle.cpp
 * Author: Ayal Moran
 * Reviewer: Roi .C
 * Date: 02-02-2026
 */

#include "Rectangle.hpp"
#include "Shapes.hpp"
#include <iostream>

namespace ilrd
{
/**
 * @brief Rectangle constructor initializes width, height, and position.
 * @param width The width of the rectangle.
 * @param height The height of the rectangle.
 * @param pos_x X coordinate of top-left corner (default: 0).
 * @param pos_y Y coordinate of top-left corner (default: 0).
 */
Rectangle::Rectangle(int width, int height, int pos_x, int pos_y)
    : Shape(pos_x, pos_y), m_width(width), m_height(height)
{
    std::cout << "Rectangle ctor" << std::endl;
}

/**
 * @brief Rectangle copy constructor copies width, height, and position.
 * @param other Reference to the Rectangle to copy from.
 */
Rectangle::Rectangle(const Rectangle& other)
    : Shape(other), m_width(other.m_width), m_height(other.m_height)
{
    std::cout << "Rectangle copy ctor" << std::endl;
}

/**
 * @brief Rectangle assignment operator assigns width, height, and position.
 * @param other Reference to the Rectangle to assign from.
 * @return Reference to this Rectangle after assignment.
 */
Rectangle& Rectangle::operator=(const Rectangle& other)
{
    std::cout << "Rectangle assignment" << std::endl;
    this->m_width = other.m_width;
    this->m_height = other.m_height;
    Shape::operator=(other);

    return *this;
}

/**
 * @brief Draw the rectangle at its position.
 */
void Rectangle::Draw() const
{
    std::cout << "Rectangle draw at (" << GetPosX() << ", " << GetPosY() << ")"
              << std::endl;
}

} // namespace ilrd
