#include "Complex.hpp"
#include <iostream>
#include <cmath>

Complex::Complex(float real, float img) : m_real(real), m_img(img)
{
    //
}

Complex::~Complex()
{
    //
}

Complex::Complex(const Complex& other)
    : m_real(other.m_real), m_img(other.m_img)
{
    //
}

Complex& Complex::operator=(const Complex& other)
{
    this->m_real = other.m_real;
    this->m_img = other.m_img;

    return *this;
}

Complex& Complex::operator+=(const Complex& other)
{
    this->m_real += other.m_real;
    this->m_img += other.m_img;

    return *this;
}

Complex& Complex::operator-=(const Complex& other)
{
    this->m_real -= other.m_real;
    this->m_img -= other.m_img;

    return *this;
}

Complex& Complex::operator*=(const Complex& other)
{
    const float a = m_real;
    const float b = m_img;
    const float c = other.m_real;
    const float d = other.m_img;

    m_real = a * c - b * d;
    m_img  = a * d + b * c;
    return *this;
}
Complex& Complex::operator/=(const Complex& other)
{
    const float a = m_real;
    const float b = m_img;
    const float c = other.m_real;
    const float d = other.m_img;

    const float denom = c * c + d * d;
    if (denom == 0)
    {
        throw std::runtime_error("Division by zero in Complex division");
    }

    m_real = (a * c + b * d) / denom;
    m_img  = (b * c - a * d) / denom;
    return *this;
}

Complex operator+(const Complex& a_, const Complex& b_)
{
    Complex tmp(a_);
    return tmp+=b_;
}

Complex operator-(const Complex& a_, const Complex& b_)
{
    Complex tmp(a_);
    return tmp-=b_;
}

Complex operator*(const Complex& a_, const Complex& b_)
{
    Complex tmp(a_);
    return tmp*=b_;
}

Complex operator/(const Complex& a_, const Complex& b_)
{
    Complex tmp(a_);
    return tmp/=b_;
}

std::ostream& operator<<(std::ostream& os, const Complex& complex)
{
    os << "{" << complex.GetReal() << (complex.GetImg() >= 0 ? " + " : " - ") << std::abs(complex.GetImg()) << "i}";

    return os;
}

std::istream& operator>>(std::istream& is, Complex& complex)
{
    float real, img;
    is >> real >> img;
    complex.SetReal(real).SetImg(img);
    return is;
}