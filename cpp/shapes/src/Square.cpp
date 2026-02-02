/*************************************
 * Square.cpp
 * Author: Ayal Moran
 * Reviewer: Roi .C
 * Date: 02-02-2026
 */

#include "Square.hpp"
#include "Shapes.hpp"
#include <iostream>

namespace ilrd
{
/**
 * @brief Square constructor initializes side length and position.
 * @param side The length of each side of the square.
 * @param pos_x X coordinate of top-left corner (default: 0).
 * @param pos_y Y coordinate of top-left corner (default: 0).
 */
Square::Square(int side, int pos_x, int pos_y)
    : Shape(pos_x, pos_y), m_side(side)
{
    std::cout << "Square ctor" << std::endl;
}

/**
 * @brief Square copy constructor copies side length and position.
 * @param other Reference to the Square to copy from.
 */
Square::Square(const Square& other) : Shape(other), m_side(other.m_side)
{
    std::cout << "Square copy ctor" << std::endl;
}

/**
 * @brief Square assignment operator assigns side length and position.
 * @param other Reference to the Square to assign from.
 * @return Reference to this Square after assignment.
 */
Square& Square::operator=(const Square& other)
{
    std::cout << "Square assignment" << std::endl;
    this->m_side = other.m_side;
    Shape::operator=(other);

    return *this;
}

/**
 * @brief Draw the square at its position.
 */
void Square::Draw() const
{
    std::cout << "Square draw at (" << GetPosX() << ", " << GetPosY() << ")"
              << std::endl;
}
} // namespace ilrd

