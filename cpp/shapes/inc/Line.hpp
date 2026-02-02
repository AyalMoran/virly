#ifndef ILRD_LINE_HPP
#define ILRD_LINE_HPP

/*************************************
 * Line.hpp
 * Author: Ayal Moran
 * Reviewer: Roi .C
 * Date: 02-02-2026
 */

#include "Shapes.hpp"

namespace ilrd
{
/**
 * @class Line
 * @brief Represents a line shape.
 * Inherits from Shape and adds length property.
 */
class Line : public Shape
{
  public:
    /**
     * @brief Constructor for Line.
     * @param length The length of the line.
     * @param pos_x X coordinate of the starting point (default: 0).
     * @param pos_y Y coordinate of the starting point (default: 0).
     */
    Line(int length, int pos_x = 0, int pos_y = 0);
    
    /**
     * @brief Copy constructor for Line.
     * @param rhs Reference to another Line to copy from.
     */
    Line(const Line&);
    
    /**
     * @brief Virtual destructor for Line.
     */
    virtual inline ~Line();
    
    /**
     * @brief Assignment operator for Line.
     * @param rhs Reference to another Line to assign from.
     * @return Reference to this Line after assignment.
     */
    inline virtual Line& operator=(const Line&);

    /**
     * @brief Draw the line.
     */
    virtual void Draw() const;

  private:
    /** @brief Length of the line. */
    int m_length;
};

inline Line::~Line()
{
    std::cout << "Line dtor" << std::endl;
}
} // namespace ilrd
#endif // ILRD_LINE_HPP
