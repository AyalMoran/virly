#include <iostream>

namespace ilrd
{
class Shape
{
  public:
    Shape(int pos_x = 0, int pos_y = 0);
    Shape(const Shape&);
    virtual inline ~Shape();

    virtual Shape& Move(const int& move_by_x, const int& move_by_y);
    virtual void Draw() const = 0;

  protected:
    inline int GetPosX() const;
    inline int GetPosY() const;

  private:
    int pos_x;
    int pos_y;
};

inline Shape& Shape::Move(const int& move_by_x, const int& move_by_y)
{
    this->pos_x += move_by_x;
    this->pos_y += move_by_y;
    return *this;
}
inline int Shape::GetPosX() const
{
    return pos_x;
}
inline int Shape::GetPosY() const
{
    return pos_y;
}

inline Shape::~Shape()
{
    pos_x = 0;
    pos_y = 0;
}

} // namespace ilrd
