#include <memory>
#include <string>

#include "Factory.hpp"
#include "test_utils.hpp"

namespace
{

enum class AnimalKey
{
    DOG = 1,
    CAT = 2,
    BIRD = 3
};

class Animal
{
  public:
    virtual ~Animal() {}
    virtual std::string Speak() const = 0;
};

class Dog : public Animal
{
  public:
    explicit Dog(int age)
        : m_age(age)
    {
    }

    std::string Speak() const
    {
        return (m_age > 0) ? "woof" : "puppy";
    }

  private:
    int m_age;
};

class Cat : public Animal
{
  public:
    explicit Cat(int lives)
        : m_lives(lives)
    {
    }

    std::string Speak() const
    {
        return (m_lives > 1) ? "meow" : "last-meow";
    }

  private:
    int m_lives;
};

class Bird : public Animal
{
  public:
    Bird() {}

    std::string Speak() const
    {
        return "tweet";
    }
};

void TestAddAndCreate()
{
    INIT_SUITE(suite, "Factory Add/Create");
    BEGIN_SUITE(suite);

    ilrd::Factory<Animal, AnimalKey, int> factory;
    factory.Add(AnimalKey::DOG,
                [](int age) { return std::unique_ptr<Animal>(new Dog(age)); });
    factory.Add(AnimalKey::CAT,
                [](int lives) { return std::unique_ptr<Animal>(new Cat(lives)); });

    std::unique_ptr<Animal> dog = factory.Create(AnimalKey::DOG, 2);
    std::unique_ptr<Animal> cat = factory.Create(AnimalKey::CAT, 9);

    ASSERT_NOT_NULL(suite, dog.get());
    ASSERT_NOT_NULL(suite, cat.get());
    ASSERT_EQ(suite, std::string("woof"), dog->Speak());
    ASSERT_EQ(suite, std::string("meow"), cat->Speak());

    END_SUITE(suite);
}

void TestDuplicateKeyThrows()
{
    INIT_SUITE(suite, "Factory Duplicate Key");
    BEGIN_SUITE(suite);

    ilrd::Factory<Animal, AnimalKey, int> factory;
    bool did_throw = false;

    factory.Add(AnimalKey::DOG,
                [](int age) { return std::unique_ptr<Animal>(new Dog(age)); });

    try
    {
        factory.Add(AnimalKey::DOG,
                    [](int age) { return std::unique_ptr<Animal>(new Dog(age)); });
    }
    catch (const ilrd::Factory<Animal, AnimalKey, int>::DuplicateKeyException&)
    {
        did_throw = true;
    }

    ASSERT_TRUE(suite, did_throw);

    END_SUITE(suite);
}

void TestMissingKeyThrows()
{
    INIT_SUITE(suite, "Factory Missing Key");
    BEGIN_SUITE(suite);

    ilrd::Factory<Animal, AnimalKey, int> factory;
    bool did_throw = false;

    factory.Add(AnimalKey::DOG,
                [](int age) { return std::unique_ptr<Animal>(new Dog(age)); });

    try
    {
        factory.Create(AnimalKey::CAT, 5);
    }
    catch (const ilrd::Factory<Animal, AnimalKey, int>::KeyNotFoundException&)
    {
        did_throw = true;
    }

    ASSERT_TRUE(suite, did_throw);

    END_SUITE(suite);
}

void TestCreateNoArgs()
{
    INIT_SUITE(suite, "Factory No Args");
    BEGIN_SUITE(suite);

    ilrd::Factory<Animal, AnimalKey> factory;
    factory.Add(AnimalKey::BIRD,
                []() { return std::unique_ptr<Animal>(new Bird()); });

    std::unique_ptr<Animal> bird = factory.Create(AnimalKey::BIRD);

    ASSERT_NOT_NULL(suite, bird.get());
    ASSERT_EQ(suite, std::string("tweet"), bird->Speak());

    END_SUITE(suite);
}

void RegisterTests()
{
    REGISTER_TEST(TestAddAndCreate);
    REGISTER_TEST(TestDuplicateKeyThrows);
    REGISTER_TEST(TestMissingKeyThrows);
    REGISTER_TEST(TestCreateNoArgs);
}

} // namespace

int main()
{
    PRINT_TEST_HEADER("Factory");
    RegisterTests();

    for (int i = 0; i < TestUtils::GetRegisteredTestCount(); ++i)
    {
        TestUtils::RunRegisteredTest(i);
    }

    PRINT_SUMMARY();

    return 0;
}
