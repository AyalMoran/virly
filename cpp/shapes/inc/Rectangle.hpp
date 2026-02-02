#ifndef ILRD_RECTANGLE_HPP
#define ILRD_RECTANGLE_HPP

/*************************************
 * Rectangle.hpp
 * Author: Ayal Moran
 * Reviewer: Roi .C
 * Date: 02-02-2026
 */

#include "Shapes.hpp"
#include <iostream>

namespace ilrd
{
/**
 * @class Rectangle
 * @brief Represents a rectangle shape.
 * Inherits from Shape and adds width and height properties.
 */
class Rectangle : public Shape
{
  public:
    /**
     * @brief Constructor for Rectangle.
     * @param width The width of the rectangle.
     * @param height The height of the rectangle.
     * @param pos_x X coordinate of the top-left corner (default: 0).
     * @param pos_y Y coordinate of the top-left corner (default: 0).
     */
    Rectangle(int width, int height, int pos_x = 0, int pos_y = 0);
    
    /**
     * @brief Copy constructor for Rectangle.
     * @param rhs Reference to another Rectangle to copy from.
     */
    Rectangle(const Rectangle&);
    
    /**
     * @brief Virtual destructor for Rectangle.
     */
    virtual inline ~Rectangle();
    
    /**
     * @brief Assignment operator for Rectangle.
     * @param rhs Reference to another Rectangle to assign from.
     * @return Reference to this Rectangle after assignment.
     */
    virtual Rectangle& operator=(const Rectangle&);

    /**
     * @brief Draw the rectangle.
     */
    virtual void Draw() const;

  private:
    /** @brief Width of the rectangle. */
    int m_width;
    /** @brief Height of the rectangle. */
    int m_height;
};

Rectangle::~Rectangle()
{
    std::cout << "Rectangle dtor" << std::endl;
}
} // namespace ilrd
#endif // ILRD_RECTANGLE_HPP
