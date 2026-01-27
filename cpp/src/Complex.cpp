#include <cmath>
#include <iostream>

#include "Complex.hpp"

namespace ilrd
{
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
    float temp_real = m_real * other.m_real - m_img * other.m_img;
    float temp_img = m_real * other.m_img + m_img * other.m_real;

    m_real = temp_real;
    m_img = temp_img;
    return *this;
}

Complex& Complex::operator/=(const Complex& other)
{
    if (0 == other)
    {
        throw std::runtime_error("Division by zero in Complex division");
    }

    float denominator = other.m_real * other.m_real + other.m_img * other.m_img;
    float temp_real =
        (m_real * other.m_real + m_img * other.m_img) / denominator;
    float temp_img =
        (m_img * other.m_real - m_real * other.m_img) / denominator;

    m_real = temp_real;
    m_img = temp_img;

    return *this;
}

Complex operator+(const Complex& lhs_, const Complex& rhs_)
{
    Complex tmp(lhs_);
    return tmp += rhs_;
}

Complex operator-(const Complex& lhs_, const Complex& rhs_)
{
    Complex tmp(lhs_);
    return tmp -= rhs_;
}

Complex operator*(const Complex& lhs_, const Complex& rhs_)
{
    Complex tmp(lhs_);
    return tmp *= rhs_;
}

Complex operator/(const Complex& lhs_, const Complex& rhs_)
{
    Complex tmp(lhs_);
    return tmp /= rhs_;
}

std::ostream& operator<<(std::ostream& os, const Complex& complex)
{

    os << "{" << complex.GetReal() << (complex.GetImg() >= 0 ? " + " : " - ")
       << std::abs(complex.GetImg()) << "i}";

    return os;
}

std::istream& operator>>(std::istream& is, Complex& complex)
{
    float real, img;
    is >> real >> img;
    complex.SetReal(real).SetImg(img);
    return is;
}
} // namespace ilrd