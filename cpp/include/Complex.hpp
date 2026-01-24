
#include <iostream>

class Complex
{
  public:
    Complex(float real = 0, float img = 0);
    ~Complex();
    Complex(const Complex&);
    Complex& operator=(const Complex&);
    
    Complex& SetReal(float real_);
    Complex& SetImg(float m_img);
    inline float GetReal() const;
    inline float GetImg() const;
    
    Complex& operator+=(const Complex&);
    Complex& operator-=(const Complex& other);
    Complex& operator*=(const Complex& other);
    Complex& operator/=(const Complex& other);
    
    inline bool operator==(const Complex& other) const;
    inline bool operator!=(const Complex& other) const;    

  private:
    float m_real;
    float m_img;
};

Complex operator+(const Complex& a_, const Complex& b_);
Complex operator-(const Complex& a_, const Complex& b_);
Complex operator*(const Complex& a_, const Complex& b_);
Complex operator/(const Complex& a_, const Complex& b_);

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

inline bool Complex::operator==(const Complex& other) const
{
    return (this->m_img == other.m_img && this->m_real == other.m_real);
}

inline bool Complex::operator!=(const Complex& other) const
{
    return !(*this == other);
}