#ifndef ILRD_SQUARE_HPP
#define ILRD_SQUARE_HPP

/*************************************
 * Square.hpp
 * Author: Ayal Moran
 * Reviewer: Roi .C
 * Date: 02-02-2026
 */

#include "Shapes.hpp"
#include <iostream>

namespace ilrd
{
/**
 * @class Square
 * @brief Represents a square shape.
 * Inherits from Shape and adds side length property.
 */
class Square : public Shape
{
  public:
    /**
     * @brief Constructor for Square.
     * @param side The length of each side of the square.
     * @param pos_x X coordinate of the top-left corner (default: 0).
     * @param pos_y Y coordinate of the top-left corner (default: 0).
     */
    Square(int side, int pos_x = 0, int pos_y = 0);
    
    /**
     * @brief Copy constructor for Square.
     * @param rhs Reference to another Square to copy from.
     */
    Square(const Square&);
    
    /**
     * @brief Virtual destructor for Square.
     */
    virtual inline ~Square();
    
    /**
     * @brief Assignment operator for Square.
     * @param rhs Reference to another Square to assign from.
     * @return Reference to this Square after assignment.
     */
    virtual Square& operator=(const Square&);

    /**
     * @brief Draw the square.
     */
    virtual void Draw() const;

  private:
    /** @brief Side length of the square. */
    int m_side;
};

Square::~Square()
{
    std::cout << "Square dtor" << std::endl;
}

} // namespace ilrd
#endif // ILRD_SQUARE_HPP
