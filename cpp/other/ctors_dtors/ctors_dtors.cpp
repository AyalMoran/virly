#include <iostream>
#ifdef ILRD_EXAMPLE
struct X
{
    explicit X(); // Initialization function without parameters is named default constructor (often abbreviated as: default ctor).
    explicit X(int a, int b = 8); // Regular (non default) Ctor.
    ~X(); //Deinitialization function is called destructor (Dtor).
    X(const X& other_); //Copy initialization function is called copy constructor or CCtor.
    X& operator=(const X& other_); //Assignment operator.
    
    int m_f;
    const int m_b;
};

X::X(): m_f(3), m_b(4) //Implementation of the default Ctor. Why the X::X? The code after the colon is called an initialization list.
{
    // m_a = 3;
    // m_b = 4;
    std::cout << "this:" << this <<
    " X default Ctor. m_a:" << m_f <<
    " m_b:" << m_b << std::endl;
}

X::X(int a, int b): m_f(a), m_b(b) //Implementation of the second Ctor.
{
    std::cout << "this:" << this <<
    " X int Ctor. m_a:" << m_f <<
    " m_b:" << m_b << std::endl;
}

X::X(const X& other_): m_f(other_.m_f), m_b(other_.m_b) //Implementation of the copy Ctor.
{
    std::cout << "this:" << this <<
    " X copy Ctor. m_a:" << m_f <<
    " m_b:" << m_b << std::endl;
}

X& X::operator=(const X& other_)
{
    m_f= other_.m_f;
    // m_b= other_.m_b;
    std::cout << "this:" << this <<
    " X assignment operator. m_a:" << m_f <<
    " does not change m_b:" << m_b << std::endl;
    return *this;
}

X::~X()
{
    std::cout << "this:" << this <<
    " X Dtor. m_a:" << m_f <<
    " m_b:" << m_b << std::endl;
}

int main()
{
    X x1;
    X x2(7);
    X *px = new X(x2);
    X x3(9,10);
    X x4(x1);

    x1 = x3;

    delete px; px = 0;
    
    X* xp= new X[10];
    delete[] xp;

    return 0;
}
#endif // ILRD_EXAMPLE

#ifdef MY_EXAMPLE

struct Y
{
    explicit Y();
    explicit Y( int j);
    explicit Y(const Y& other_);
    Y& operator=(int i);
    ~Y();

    int j;
};

Y::Y()
{
    this->j = 1;
    std::cout << "Y ctor" << this->j << std::endl;;
}
Y::~Y()
{
    std::cout << "Y dtor" << this->j << std::endl;
}

Y::Y(int j)
{
    this->j = j;
    std::cout << "Y default " << this->j << std::endl;
}

Y::Y(const Y& other_)
{
    this->j = j;
    std::cout << "Y copy" << this->j << std::endl;
}


Y& Y::operator=(int i)
{
    this->j = i;
    std::cout << "Y assignment " << this->j << std::endl;
    return *this;
}


struct X
{
    explicit X(); // Initialization function without parameters is named default constructor (often abbreviated as: default ctor).
    explicit X(int a, int b = 8); // Regular (non default) Ctor.
    ~X(); //Deinitialization function is called destructor (Dtor).
    X(const X& other_); //Copy initialization function is called copy constructor or CCtor.
    X& operator=(const X& other_); //Assignment operator.

    Y y;
};

X::X() : y(4)
{
    y = 3;
    std::cout << "X default" << std::endl;
}

X::X(int a, int b)
{
    std::cout << "X int int" << std::endl;
}

X::X(const X& other_)
{
        std::cout << "X copytor" << std::endl;
}

X& X::operator=(const X& other_)
{
    std::cout << "X assignment" << std::endl;
    return *this;
}

X::~X()
{
    std::cout << "X dtor" << std::endl;
}

int main()
{
    Y y;
    X x;
    return 0;
}
#endif // MY_EXAMPLE