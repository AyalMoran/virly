/*************************************
 * Line.cpp
 * Author: Ayal Moran
 * Reviewer: Roi .C
 * Date: 02-02-2026
 */

#include "Line.hpp"
#include "Shapes.hpp"
#include <iostream>

namespace ilrd
{

/**
 * @brief Line constructor initializes length and position.
 * @param length The length of the line.
 * @param pos_x X coordinate of starting point (default: 0).
 * @param pos_y Y coordinate of starting point (default: 0).
 */
Line::Line(int length, int pos_x, int pos_y)
    : Shape(pos_x, pos_y), m_length(length)
{
    std::cout << "Line ctor" << std::endl;
}

/**
 * @brief Line copy constructor copies length and position.
 * @param other Reference to the Line to copy from.
 */
Line::Line(const Line& other) : Shape(other), m_length(other.m_length)
{
    std::cout << "Line copy ctor" << std::endl;
}

/**
 * @brief Line assignment operator assigns length and position.
 * @param other Reference to the Line to assign from.
 * @return Reference to this Line after assignment.
 */
Line& Line::operator=(const Line& other)
{
    std::cout << "Line assignment" << std::endl;
    this->m_length = other.m_length;
    Shape::operator=(other);

    return *this;
}

/**
 * @brief Draw the line at its position.
 */
void Line::Draw() const
{
    std::cout << "Line draw at (" << GetPosX() << ", " << GetPosY() << ")"
              << std::endl;
}

} // namespace ilrd