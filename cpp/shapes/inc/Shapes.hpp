#ifndef ILRD_SHAPES_HPP
#define ILRD_SHAPES_HPP

/*************************************
 * Shapes.hpp
 * Author: Ayal Moran
 * Reviewer: Roi .C
 * Date: 02-02-2026
 */

#include <iostream>

namespace ilrd
{ 
/**
 * @class Shape
 * @brief Abstract base class for all geometric shapes.
 * Provides core functionality for positioning and movement of shapes.
 */
class Shape
{
  public:
    /**
     * @brief Constructor for Shape.
     * @param pos_x X coordinate of the shape (default: 0).
     * @param pos_y Y coordinate of the shape (default: 0).
     */
    Shape(int pos_x = 0, int pos_y = 0);
    
    /**
     * @brief Copy constructor for Shape.
     * @param rhs Reference to another Shape to copy from.
     */
    Shape(const Shape&);
    
    /**
     * @brief Virtual destructor for Shape.
     */
    virtual inline ~Shape();

    /**
     * @brief Move shape by given offset.
     * @param move_by_x Offset in X direction.
     * @param move_by_y Offset in Y direction.
     * @return Reference to this Shape after movement.
     */
    virtual inline Shape& Move(const int& move_by_x, const int& move_by_y);
    
    /**
     * @brief Pure virtual function to draw the shape.
     * Must be implemented by derived classes.
     */
    virtual void Draw() const = 0;

  protected:
    /**
     * @brief Get X coordinate of the shape.
     * @return Current X position.
     */
    inline int GetPosX() const;
    
    /**
     * @brief Get Y coordinate of the shape.
     * @return Current Y position.
     */
    inline int GetPosY() const;

  private:
    /** @brief X coordinate of the shape. */
    int pos_x;
    /** @brief Y coordinate of the shape. */
    int pos_y;
};

 Shape& Shape::Move(const int& move_by_x, const int& move_by_y)
{
    this->pos_x += move_by_x;
    this->pos_y += move_by_y;
    return *this;
}
 int Shape::GetPosX() const
{
    return pos_x;
}
 int Shape::GetPosY() const
{
    return pos_y;
}

 Shape::~Shape()
{
    pos_x = 0;
    pos_y = 0;
}

} // namespace ilrd

#endif // ILRD_SHAPES_HPP
