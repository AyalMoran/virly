#include <iostream>

struct X
{
    explicit X(int);
    ~X();
    void Foo();
    void Bar() const;

    int m_a;
    int* m_p;
};

X::X(int a_) : m_a(a_), m_p(new int(a_))
{
}

X::~X()
{
    delete m_p;
    m_p = 0;
}

void X::Foo()
{
    ++m_a;
    --(*m_p);
}

void X::Bar() const
{
    std::cout << m_a << std::endl;
    std::cout << *m_p << std::endl;
    std::cout << m_p << std::endl;
    // m_a = 0; //--1---
    // m_p = 0; //--2---
    // *m_p = 0; //--3---
    // Foo(); //--5---
}

void Fifi(const X& x_)
{
    // x_.Foo(); //--4---
    x_.Bar();
}

int main()
{
    X x1(1);
    X x2(x1); // double free at destructor
    /*
    The default copy constructor performs a shallow copy of m_p, leading to both x1 and x2 pointing to the same memory. When both are destroyed, delete m_p is called twice on the same pointer, causing undefined behavior (double free).
    */
    X x3 = x2;  
    /*
    No assignment operator is defined, so the compiler will generate one that does a shallow copy of the pointers, leading to the same double free problem when x3 and x2 are destroyed.
    */
    x1.Foo();
    Fifi(x1);

    return 0;
}