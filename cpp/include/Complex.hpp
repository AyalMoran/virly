
#include <iostream>

namespace ilrd
{

class Complex
{
  public:
    Complex(float real = 0, float img = 0);
    ~Complex();
    Complex(const Complex&);
    Complex& operator=(const Complex&);

    inline Complex& SetReal(float real_);
    inline Complex& SetImg(float img_);
    inline float GetReal() const;
    inline float GetImg() const;

    Complex& operator+=(const Complex&);
    Complex& operator-=(const Complex& other);
    Complex& operator*=(const Complex& other);
    Complex& operator/=(const Complex& other);

  private:
    float m_real;
    float m_img;
};

Complex operator+(const Complex& lhs_, const Complex& rhs_);
Complex operator-(const Complex& lhs_, const Complex& rhs_);
Complex operator*(const Complex& lhs_, const Complex& rhs_);
Complex operator/(const Complex& lhs_, const Complex& rhs_);

bool operator==(const Complex& lhs_, const Complex& rhs_);
bool operator!=(const Complex& lhs_, const Complex& rhs_);

std::ostream& operator<<(std::ostream& os, const Complex& complex);
std::istream& operator>>(std::istream& is, Complex& complex);

inline float Complex::GetReal() const
{
    return this->m_real;
}

inline float Complex::GetImg() const
{
    return this->m_img;
}

inline Complex& Complex::SetReal(float real_)
{
    this->m_real = real_;
    return *this;
}

inline Complex& Complex::SetImg(float img_)
{
    this->m_img = img_;
    return *this;
}

inline bool operator==(const Complex& lhs_, const Complex& rhs_)
{
    return (lhs_.GetImg() == rhs_.GetImg() && lhs_.GetReal() == rhs_.GetReal());
}

inline bool operator!=(const Complex& lhs_, const Complex& rhs_)
{
    return !(lhs_ == rhs_);
}
} // namespace ilrd