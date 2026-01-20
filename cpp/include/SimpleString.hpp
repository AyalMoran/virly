
#include <cstddef>

class String
{
  public:
    String(const char* cstr = "");
    String(const String& other);
  
    ~String();

    // = operator
    String& operator=(const String& other);
    //String& operator=(const char* cstr);
    // + operator
    //String& operator+(const char* cstr);
    //String& operator+(const String& other);
    // - operator
    //String& operator-(const String& other);

    // ++ prefix operator 
    //String& ++operator();
    // -- prefix operator 
    //String& --operator();

    size_t Length();
    inline char* Cstr();

    friend std::ostream& operator<<(std::ostream& os, const String& str);

  private:
    char* m_cstr;
};