
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <cstdlib>
#include <iostream>

class Transaction {  // base class for all transactions
   public:           
    Transaction();

    virtual void logTransaction() const = 0;  // make type-dependent log entry
};

Transaction::Transaction()  // implementation of
{                           // base class ctor
    logTransaction();   // as final action, log this transaction
}  

class BuyTransaction : public Transaction {  // derived class
   public:

    virtual void logTransaction() const;  // how to log transactions of this type
    
};

void BuyTransaction::logTransaction() const
{
    std::cout << "BuyTransaction logTransaction" << std::endl;
}

class SellTransaction : public Transaction {  // derived class
   public:
    virtual void logTransaction() const;  // how to log transactions of this type
};

void SellTransaction::logTransaction() const
{
    std::cout << "SellTransaction logTransaction" << std::endl;
}

int main(void) 
{
    BuyTransaction b;

    return 0;
}
