

namespace ilrd
{
class Mutex
{
  public:
    Mutex();
    ~Mutex();
    void lock();
    void unlock();

  private:
};
} // namespace ilrd

class User
{
  public:
    int balance;
};

User a;
User b;

// Users are stored in a container accessible globally
int transfer(User from, User to, int amount)
{
    lock(from)
    if (amount > from.balance)
    {
        throw;
    }
    lock(to)
    from.balance -= amount;
    to.balance += amount;

    unlock(to);
    unlock(from);
}

// a to b
// b to a