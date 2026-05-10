#include <iostream>
#include <cassert>

#include "serialization/Serializer.hpp"

void TestSimpleSerialization()
{
    int a = 1;
    int b = 2;
    int c = 3;
    int d = 4;
    int e = 5;
    int f = 6;
    int g = 7;
    int h = 8;
    int i = 9;
    int j = 10;
    ilrd::Buffer buffer;
    buffer << a;
    buffer << b;
    buffer << c;
    buffer << d;
    buffer << e;
    buffer << f;
    buffer << g;
    buffer << h;
    buffer << i;
    buffer << j;

    int a2;
    int b2;
    int c2;
    int d2;
    int e2;
    int f2;
    int g2;
    int h2;
    int i2;
    int j2;

    buffer >> a2;
    buffer >> b2;
    buffer >> c2;
    buffer >> d2;
    buffer >> e2;
    buffer >> f2;
    buffer >> g2;
    buffer >> h2;
    buffer >> i2;
    buffer >> j2;
    assert(a2 == a);
    assert(b2 == b);
    assert(c2 == c);
    assert(d2 == d);
    assert(e2 == e);
    assert(f2 == f);
    assert(g2 == g);
    assert(h2 == h);
    assert(i2 == i);
    assert(j2 == j);

    std::cout << "a2: " << a2 << std::endl;
    std::cout << "b2: " << b2 << std::endl;
    std::cout << "c2: " << c2 << std::endl;
    std::cout << "d2: " << d2 << std::endl;
    std::cout << "e2: " << e2 << std::endl;
    std::cout << "f2: " << f2 << std::endl;
    std::cout << "g2: " << g2 << std::endl;
    std::cout << "h2: " << h2 << std::endl;
    std::cout << "i2: " << i2 << std::endl;
    std::cout << "j2: " << j2 << std::endl;
}

struct Student
{
    Student(int& id_, int age_ = 0, double grade_ = 0.0, std::string name_ = ""): id_ptr(&id_), age(age_), grade(grade_), name(name_) {}

    ilrd::Buffer& Serialize(ilrd::Buffer& buffer) const
    {
        buffer << *id_ptr;
        buffer << age;
        buffer << grade;
        buffer << name;
        return buffer;
    }

    ilrd::Buffer& Deserialize(ilrd::Buffer& buffer)
    {
        buffer >> *id_ptr;
        buffer >> age;
        buffer >> grade;
        buffer >> name;
        return buffer;
    }

    int* id_ptr;
    int age;
    double grade;
    std::string name;
};

void TestStructSerialization()
{
    int id = 1;
    Student student1 = {id, 20, 85.5, "John Doe"};
    ilrd::Buffer buffer;
    buffer << student1;

    int id2 = 420;
    Student student2 = {id2, 20, 85.5, "John Doe"};

    buffer >> student2;

    std::cout << "student2: " << *student2.id_ptr << " " << student2.age << " " << student2.grade << " " << student2.name << std::endl;
    std::cout << "student2.id_ptr: " << student2.id_ptr << std::endl;
    std::cout << "student2.id_ptr: " << *student2.id_ptr << std::endl;
    std::cout << "student1.id_ptr: " << student1.id_ptr << std::endl;
    std::cout << "student1.id_ptr: " << *student1.id_ptr << std::endl;
}

int main()
{
    std::cout << "Testing Simple Serialization" << std::endl;
    TestSimpleSerialization();
    std::cout << "Testing Struct Serialization" << std::endl;
    TestStructSerialization();

    return 0;
}
