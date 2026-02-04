#ifndef ILRD_CIRCLE_HPP
#define ILRD_CIRCLE_HPP

/*************************************
 * Circle.hpp
 * Author: Ayal Moran
 * Reviewer: Roi .C
 * Date: 02-02-2026
 */

#include "Shapes.hpp"
#include <iostream>

namespace ilrd
{
/**
 * @class Circle
 * @brief Represents a circle shape.
 * Inherits from Shape and adds radius property.
 */
class Circle : public Shape
{
  public:
    /**
     * @brief Constructor for Circle.
     * @param radius The radius of the circle.
     * @param pos_x X coordinate of the center (default: 0).
     * @param pos_y Y coordinate of the center (default: 0).
     */
    Circle(int radius, int pos_x = 0, int pos_y = 0);
    
    /**
     * @brief Copy constructor for Circle.
     * @param rhs Reference to another Circle to copy from.
     */
    Circle(const Circle&);
    
    /**
     * @brief Virtual destructor for Circle.
     */
    virtual inline ~Circle();
    
    /**
     * @brief Assignment operator for Circle.
     * @param rhs Reference to another Circle to assign from.
     * @return Reference to this Circle after assignment.
     */
    virtual Circle& operator=(const Circle&);

    /**
     * @brief Draw the circle.
     */
    virtual void Draw() const;

  private:
    /** @brief Radius of the circle. */
    int m_radius;
};

Circle::~Circle()
{
    std::cout << "Circle dtor" << std::endl;
}
} // namespace ilrd
#endif // ILRD_CIRCLE_HPP
