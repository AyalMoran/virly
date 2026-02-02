/*************************************
 * ShapesTest.cpp
 * Author: Ayal Moran
 * Reviewer: Roi .C
 * Date: 02-02-2026
 */

#include <Shapes.hpp>
#include <Line.hpp>
#include <Square.hpp>
#include <Rectangle.hpp>
#include <Circle.hpp>
#include <iostream>
  
using namespace ilrd;

const int NUM_SHAPES = 4;

int main()
{
    Shape* shapes[NUM_SHAPES];

    shapes[0] = new Line(10);
    shapes[1] = new Circle(5);
    shapes[2] = new Rectangle(10, 5);
    shapes[3] = new Square(5);

    shapes[0]->Move(1,2);
    shapes[1]->Move(3,4);
    shapes[2]->Move(5,6);
    shapes[3]->Move(7,8);

    std::cout << "Drawing\n";
    std::cout << "===========================\n";
    
    for (int i = 0; i < NUM_SHAPES; i++)
    {
        shapes[i]->Draw();
    }

    std::cout << "===========================\n";
    for (int i = 0; i < NUM_SHAPES; i++)
    {
        delete shapes[i];
    }

    return 0;
}
