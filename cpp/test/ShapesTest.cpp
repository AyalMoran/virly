#include <Shapes.hpp>
#include <iostream>
  
using namespace ilrd;
class Line : public Shape
{
  public:
    Line(int length, int pos_x = 0, int pos_y = 0);
    Line(const Line&);
    virtual inline ~Line();
    virtual Line& operator=(const Line&);

    virtual void Draw() const;

  private:
    int m_length;
};

Line::~Line()
{
    std::cout << "Line dtor" << std::endl;
}

Line::Line(int length, int pos_x, int pos_y)
    : Shape(pos_x, pos_y), m_length(length)
{
    std::cout << "Line ctor" << std::endl;
}

Line::Line(const Line& other) : Shape(other), m_length(other.m_length)
{
    std::cout << "Line copy ctor" << std::endl;
}

Line& Line::operator=(const Line& other)
{
    std::cout << "Line assignment" << std::endl;
    this->m_length = other.m_length;
    Shape::operator=(other);

    return *this;
}

void Line::Draw() const
{
    std::cout << "Line draw at (" << GetPosX() << ", " << GetPosY() << ")" << std::endl;
}

class Circle : public Shape
{
  public:
    Circle(int radius, int pos_x = 0, int pos_y = 0);
    Circle(const Circle&);
    virtual inline ~Circle();
    virtual Circle& operator=(const Circle&);

    virtual void Draw() const;

  private:
    int m_radius;
};

Circle::Circle(int radius, int pos_x, int pos_y)
    : Shape(pos_x, pos_y), m_radius(radius)
{
    std::cout << "Circle ctor" << std::endl;
}

Circle::Circle(const Circle& other) : Shape(other), m_radius(other.m_radius)
{
    std::cout << "Circle copy ctor" << std::endl;
}

Circle::~Circle()
{
    std::cout << "Circle dtor" << std::endl;
}

Circle& Circle::operator=(const Circle& other)
{
    std::cout << "Circle assignment" << std::endl;
    this->m_radius = other.m_radius;
    Shape::operator=(other);

    return *this;
}

void Circle::Draw() const
{
    std::cout << "Circle draw at (" << GetPosX() << ", " << GetPosY() << ")" << std::endl;
}

class Rectangle : public Shape
{
  public:
    Rectangle(int width, int height, int pos_x = 0, int pos_y = 0);
    Rectangle(const Rectangle&);
    virtual inline ~Rectangle();
    virtual Rectangle& operator=(const Rectangle&);

    virtual void Draw() const;

  private:
    int m_width;
    int m_height;
};

Rectangle::Rectangle(int width, int height, int pos_x, int pos_y)
    : Shape(pos_x, pos_y), m_width(width), m_height(height)
{
    std::cout << "Rectangle ctor" << std::endl;
}

Rectangle::Rectangle(const Rectangle& other)
    : Shape(other), m_width(other.m_width), m_height(other.m_height)
{
    std::cout << "Rectangle copy ctor" << std::endl;
}

Rectangle::~Rectangle()
{
    std::cout << "Rectangle dtor" << std::endl;
}

Rectangle& Rectangle::operator=(const Rectangle& other)
{
    std::cout << "Rectangle assignment" << std::endl;
    this->m_width = other.m_width;
    this->m_height = other.m_height;
    Shape::operator=(other);

    return *this;
}

void Rectangle::Draw() const
{
    std::cout << "Rectangle draw at (" << GetPosX() << ", " << GetPosY() << ")" << std::endl;
}

class Square : public Shape
{
  public:
    Square(int side, int pos_x = 0, int pos_y = 0);
    Square(const Square&);
    virtual inline ~Square();
    virtual Square& operator=(const Square&);

    virtual void Draw() const;

  private:
    int m_side;
};

Square::Square(int side, int pos_x, int pos_y)
    : Shape(pos_x, pos_y), m_side(side)
{
    std::cout << "Square ctor" << std::endl;
}

Square::Square(const Square& other) : Shape(other), m_side(other.m_side)
{
    std::cout << "Square copy ctor" << std::endl;
}

Square::~Square()
{
    std::cout << "Square dtor" << std::endl;
}

Square& Square::operator=(const Square& other)
{
    std::cout << "Square assignment" << std::endl;
    this->m_side = other.m_side;
    Shape::operator=(other);

    return *this;
}

void Square::Draw() const
{
    std::cout << "Square draw at (" << GetPosX() << ", " << GetPosY() << ")" << std::endl;
}

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
