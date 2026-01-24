#include <iostream>
#include <string>
#include <vector>
#include <type_traits>

// source: learncpp.com - function overloading and resolution
// ============================================================================
// 1: BASIC OVERLOADING PATTERNS
// ============================================================================

int sum(int a, int b) {
    std::cout << "sum(int, int)\n";
    return a + b;
}

int sum(int a, int b, int c) {
    std::cout << "sum(int, int, int)\n";
    return a + b + c;
}

void print(int value) {
    std::cout << "print(int): " << value << std::endl;
}

void print(double value) {
    std::cout << "print(double): " << value << std::endl;
}

void print(const char* str) {
    std::cout << "print(const char*): " << str << std::endl;
}

void print(const std::string& str) {
    std::cout << "print(const std::string&): " << str << std::endl;
}

// ============================================================================
// 2: TYPE CONVERSIONS - IMPLICIT CONVERSIONS
// ============================================================================

// Integral promotions: char, short -> int
void func_promotion(int x) {
    std::cout << "func_promotion(int)\n";
}

void func_promotion(long x) {
    std::cout << "func_promotion(long)\n";
}

// Standard conversions: int -> double (floating-point promotion)
void func_standard(int x) {
    std::cout << "func_standard(int)\n";
}

void func_standard(double x) {
    std::cout << "func_standard(double)\n";
}

// PITFALL 1: Promotion vs conversion - promotion is preferred
void func_preference(int x) {
    std::cout << "func_preference(int) - PROMOTION\n";
}

void func_preference(double x) {
    std::cout << "func_preference(double) - CONVERSION\n";
}

// ============================================================================
//  3: QUALIFICATION CONVERSIONS (const, volatile)
// ============================================================================

// PITFALL 2: const-ness affects overload resolution
void func_const(int* ptr) {
    std::cout << "func_const(int*) - non-const pointer\n";
}

void func_const(const int* ptr) {
    std::cout << "func_const(const int*) - const pointer\n";
}

void func_const_ref(int& ref) {
    std::cout << "func_const_ref(int&) - non-const reference\n";
}

void func_const_ref(const int& ref) {
    std::cout << "func_const_ref(const int&) - const reference\n";
}

// Overload with const member function (applicable to methods)
class MyClass {
public:
    void method() {
        std::cout << "MyClass::method() - non-const\n";
    }
    
    void method() const {
        std::cout << "MyClass::method() const - const\n";
    }
    
    void overload(int x) {
        std::cout << "MyClass::overload(int)\n";
    }
    
    void overload(double x) const {
        std::cout << "MyClass::overload(double) const\n";
    }
};

// ============================================================================
//  4: REFERENCE VS VALUE VS POINTER
// ============================================================================

// Reference vs value - PITFALL: both can match for lvalues, causing ambiguity
void func_ref_val(int x) {
    std::cout << "func_ref_val(int) - by value\n";
}

// Uncomment to seee ambiguity error:
// void func_ref_val(int& x) {
//     std::cout << "func_ref_val(int&) - by reference\n";
// }

// PITFALL 3: Cannot overload based solely on value vs reference for rvalues
// The following would cause ambiguity with lvalues:
void func_ref_example(int& x) {
    std::cout << "func_ref_example(int&) - lvalue reference\n";
}

void func_ref_example(const int& x) {
    std::cout << "func_ref_example(const int&) - const reference\n";
}

// With rvalue references (C++11)
void func_rvalue(int&& x) {
    std::cout << "func_rvalue(int&&) - rvalue reference\n";
}

void func_rvalue(const int& x) {
    std::cout << "func_rvalue(const int&) - const reference (fallback)\n";
}

// Pointer vs reference
void func_ptr_ref(int* ptr) {
    std::cout << "func_ptr_ref(int*)\n";
}

void func_ptr_ref(int& ref) {
    std::cout << "func_ptr_ref(int&)\n";
}

// ============================================================================
// 5: USER-DEFINED CONVERSIONS
// ============================================================================

class Integer {
    int value;
public:
    Integer(int v = 0) : value(v) {
        std::cout << "Integer::Integer(int) - conversion constructor\n";
    }
    
    // Conversion operator to int
    operator int() const {
        std::cout << "Integer::operator int() - conversion operator\n";
        return value;
    }
    
    // Conversion operator to double
    operator double() const {
        std::cout << "Integer::operator double() - conversion operator\n";
        return static_cast<double>(value);
    }
    
    int getValue() const { return value; }
};

// Functions that can be called with Integer through conversions
// PITFALL: If Integer has both operator int() and operator double(), this is ambiguous
void func_user_conv(int x) {
    std::cout << "func_user_conv(int)\n";
}

// Uncomment to see ambiguity with Integer objects:
// void func_user_conv(double x) {
//     std::cout << "func_user_conv(double)\n";
// }

// PITFALL 4: Ambiguity with multiple user-defined conversions
class Double {
public:
    Double(double d) : value(d) {}
    operator int() const { return static_cast<int>(value); }
    operator double() const { return value; }
private:
    double value;
};

void func_ambiguous(int x) {
    std::cout << "func_ambiguous(int)\n";
}

void func_ambiguous(double x) {
    std::cout << "func_ambiguous(double)\n";
}

// ============================================================================
// 6: ARRAY AND FUNCTION POINTER DECAY
// ============================================================================

// Array-to-pointer decay - note: int arr[] and int* ptr are the SAME in function signatures
void func_array(int* ptr) {
    std::cout << "func_array(int*) - array decays to pointer or explicit pointer\n";
}

// But this is different:
void func_array_size(int arr[5]) {  // Still decays, but conveys intent
    std::cout << "func_array_size(int[5]) - size hint\n";
}

// Array reference (doesn't decay)
void func_array_ref(int (&arr)[5]) {
    std::cout << "func_array_ref(int(&)[5]) - reference to array\n";
}

// Function pointer
using FuncPtr = void(*)();
void func_func_ptr(FuncPtr fp) {
    std::cout << "func_func_ptr(void(*)())\n";
}

// Function reference (rare, but possible)
void func_func_ref(FuncPtr& fp) {
    std::cout << "func_func_ref(void(*)()&)\n";
}

// ============================================================================
// 7: DEFAULT ARGUMENTS AND OVERLOADING
// ============================================================================

// PITFALL 5: Default arguments don't create overloads, but affect resolution
void func_default(int x, int y = 10) {
    std::cout << "func_default(int, int = 10)\n";
}

void func_default(int x) {
    std::cout << "func_default(int) - without default\n";
}
// func_default(5) is AMBIGUOUS! Both can be called with one argument.

// Better pattern:
void func_default_good(int x) {
    std::cout << "func_default_good(int)\n";
}

void func_default_good(int x, int y) {
    std::cout << "func_default_good(int, int)\n";
}

// ============================================================================
// 8: TEMPLATES AND OVERLOADING
// ============================================================================

// Non-template vs template
void func_template(int x) {
    std::cout << "func_template(int) - non-template\n";
}

template<typename T>
void func_template(T x) {
    std::cout << "func_template(T) - template, T = " << typeid(T).name() << std::endl;
}

// PITFALL 6: Non-template is preferred over template when exact match
template<typename T>
void func_template_pref(T x) {
    std::cout << "func_template_pref(T) - template\n";
}

void func_template_pref(int x) {
    std::cout << "func_template_pref(int) - non-template (preferred)\n";
}

// SFINAE and overload resolution
template<typename T>
typename std::enable_if<std::is_integral<T>::value>::type
func_sfinae(T x) {
    std::cout << "func_sfinae(T) - integral only\n";
}

template<typename T>
typename std::enable_if<std::is_floating_point<T>::value>::type
func_sfinae(T x) {
    std::cout << "func_sfinae(T) - floating point only\n";
}

// ============================================================================
// 9: VARIADIC FUNCTIONS
// ============================================================================

// Ellipsis (...) is the worst match in overload resolution
void func_variadic(int x) {
    std::cout << "func_variadic(int)\n";
}

void func_variadic(const char* fmt, ...) {  // C-style variadic
    std::cout << "func_variadic(const char*, ...) - variadic\n";
}

// C++11 variadic templates (preferred over C-style variadic)
template<typename... Args>
void func_variadic_template(Args... args) {
    std::cout << "func_variadic_template(Args...) - variadic template\n";
}

// ============================================================================
// 10: REF-QUALIFIERS (C++11)
// ============================================================================

class RefQualified {
public:
    // Can only be called on lvalues
    void method() & {
        std::cout << "RefQualified::method() & - lvalue\n";
    }
    
    // Can only be called on rvalues
    void method() && {
        std::cout << "RefQualified::method() && - rvalue\n";
    }
    
    // Can be called on both (const lvalue)
    void method() const & {
        std::cout << "RefQualified::method() const & - const lvalue\n";
    }
};

// ============================================================================
// 11: OVERLOAD RESOLUTION RANKING
// ============================================================================

// The compiler ranks overloads in this order:
// 1. Exact match (no conversion needed)
void resolve_exact(int x) {
    std::cout << "resolve_exact(int) - EXACT MATCH\n";
}

// 2. Promotion (char->int, float->double)
void resolve_exact(char x) {
    std::cout << "resolve_exact(char) - exact match\n";
}

void resolve_promotion(int x) {
    std::cout << "resolve_promotion(int) - PROMOTION (char->int)\n";
}

void resolve_promotion(long x) {
    std::cout << "resolve_promotion(long) - CONVERSION\n";
}

// 3. Standard conversion (int->long, int->double)
void resolve_standard(int x) {
    std::cout << "resolve_standard(int) - exact match\n";
}

void resolve_standard(double x) {
    std::cout << "resolve_standard(double) - STANDARD CONVERSION (int->double)\n";
}

// 4. User-defined conversion (via constructors or operators)
void resolve_user(int x) {
    std::cout << "resolve_user(int) - exact match\n";
}

// Note: Having both int and double overloads with Integer causes ambiguity
// void resolve_user(double x) {
//     std::cout << "resolve_user(double) - USER-DEFINED CONVERSION (Integer->int->double)\n";
// }

// 5. Ellipsis match (...)
void resolve_ellipsis(int x) {
    std::cout << "resolve_ellipsis(int) - exact match\n";
}

void resolve_ellipsis(...) {
    std::cout << "resolve_ellipsis(...) - ELLIPSIS MATCH\n";
}

// ============================================================================
// 12: AMBIGUITY CASES
// ============================================================================

// PITFALL 7: Ambiguity - two equally good conversions
class A {
public:
    A(int) {}
};

class B {
public:
    B(int) {}
};

void func_ambiguous_class(A a) {
    std::cout << "func_ambiguous_class(A)\n";
}

void func_ambiguous_class(B b) {
    std::cout << "func_ambiguous_class(B)\n";
}
// func_ambiguous_class(42) is AMBIGUOUS - both A(42) and B(42) are valid

// PITFALL 8: Ambiguity with templates
template<typename T>
void func_ambiguous_template(T t) {
    std::cout << "func_ambiguous_template(T)\n";
}

void func_ambiguous_template(int x) {
    std::cout << "func_ambiguous_template(int)\n";
}

void func_ambiguous_template(double x) {
    std::cout << "func_ambiguous_template(double)\n";
}

// PITFALL 9: Multiple viable functions with same conversion rank
void func_rank(int x, long y) {
    std::cout << "func_rank(int, long)\n";
}

void func_rank(long x, int y) {
    std::cout << "func_rank(long, int)\n";
}
// func_rank(10, 20) is AMBIGUOUS - both require one promotion

// ============================================================================
// SECTION 13: ADL (ARGUMENT-DEPENDENT LOOKUP) AND OVERLOADING
// ============================================================================

namespace MyNamespace {
    class MyType {
    public:
        MyType(int v) : value(v) {}
        int value;
    };
    
    void adl_func(MyType mt) {
        std::cout << "MyNamespace::adl_func(MyType)\n";
    }
    
    void adl_func(int x) {
        std::cout << "MyNamespace::adl_func(int)\n";
    }
}

// ADL finds functions in associated namespaces
void adl_func(MyNamespace::MyType mt) {
    std::cout << "Global::adl_func(MyType)\n";
}

// ============================================================================
// SECTION 14: CONVERSION OPERATOR OVERLOADING
// ============================================================================

class Fraction {
    int num, den;
public:
    Fraction(int n, int d) : num(n), den(d) {}
    
    // Multiple conversion operators
    operator int() const {
        return num / den;
    }
    
    operator double() const {
        return static_cast<double>(num) / den;
    }
    
    operator float() const {
        return static_cast<float>(num) / den;
    }
};

// 10: Ambiguity with multiple conversion operators
void func_fraction(int x) {
    std::cout << "func_fraction(int)\n";
}

void func_fraction(double x) {
    std::cout << "func_fraction(double)\n";
}

void func_fraction(float x) {
    std::cout << "func_fraction(float)\n";
}
// func_fraction(Fraction(1, 2)) is AMBIGUOUS if int, double, float overloads exist

// ============================================================================
// 15: CV-QUALIFIERS AND POINTERS
// ============================================================================

// Top-level vs low-level const
void func_cv_ptr(int* ptr) {
    std::cout << "func_cv_ptr(int*)\n";
}

// NOTE: int* const would be a redeclaration - top-level const is ignored in function signatures
// void func_cv_ptr(int* const ptr); // ERROR: same as int* ptr

// But this is different (low-level const):
void func_cv_ptr_const(const int* ptr) {
    std::cout << "func_cv_ptr_const(const int*)\n";
}

// Volatile qualifiers
void func_volatile(int* ptr) {
    std::cout << "func_volatile(int*)\n";
}

void func_volatile(volatile int* ptr) {
    std::cout << "func_volatile(volatile int*)\n";
}

// ============================================================================
// 16: INITIALIZER LIST (C++11)
// ============================================================================

#include <initializer_list>

void func_initializer(std::initializer_list<int> il) {
    std::cout << "func_initializer(initializer_list<int>)\n";
}

void func_initializer(const std::vector<int>& vec) {
    std::cout << "func_initializer(vector<int>)\n";
}

// Initializer lists can be preferred over other conversions
template<typename T>
void func_initializer_template(T t) {
    std::cout << "func_initializer_template(T)\n";
}

// ============================================================================
// 17: OVERLOADING WITH INHERITANCE
// ============================================================================

class Base {
public:
    virtual void overload(int x) {
        std::cout << "Base::overload(int)\n";
    }
    
    void overload(double x) {
        std::cout << "Base::overload(double)\n";
    }
};

class Derived : public Base {
public:
    // This hides Base::overload(int) unless we use 'using'
    void overload(int x) override {
        std::cout << "Derived::overload(int)\n";
    }
    
    // This hides Base::overload(double)
    void overload(double x) {
        std::cout << "Derived::overload(double)\n";
    }
    
    // Bring Base overloads into scope
    using Base::overload;
};

// ============================================================================
// 18: PITFALL - OVERLOADING OPERATORS
// ============================================================================

class OverloadDemo {
    int value;
public:
    OverloadDemo(int v) : value(v) {}
    
    // Member operator
    OverloadDemo operator+(const OverloadDemo& other) const {
        return OverloadDemo(value + other.value);
    }
    
    // Conversion for output
    operator int() const { return value; }
};

// Non-member operator (can be overloaded differently)
OverloadDemo operator+(const OverloadDemo& lhs, int rhs) {
    return OverloadDemo(static_cast<int>(lhs) + rhs);
}

OverloadDemo operator+(int lhs, const OverloadDemo& rhs) {
    return OverloadDemo(lhs + static_cast<int>(rhs));
}

// ============================================================================
// 19: COMPLEX RESOLUTION SCENARIOS
// ============================================================================

// Scenario 1: Template specialization vs overload
template<typename T>
void complex_scenario(T t) {
    std::cout << "complex_scenario(T) - primary template\n";
}

template<>
void complex_scenario(int t) {
    std::cout << "complex_scenario(int) - explicit specialization\n";
}

void complex_scenario(int t) {
    std::cout << "complex_scenario(int) - non-template overload\n";
}
// For int: non-template overload is preferred over specialization

// Scenario 2: Perfect forwarding with overloads
template<typename T>
void forwarding(T&& t) {
    std::cout << "forwarding(T&&) - universal reference\n";
}

void forwarding(int x) {
    std::cout << "forwarding(int) - lvalue/rvalue int\n";
}
// forwarding(42) calls forwarding(int), not the template

// ============================================================================
// 20: TESTING AND DEMONSTRATION
// ============================================================================

int main() {
    std::cout << "=== SECTION 1: BASIC OVERLOADING ===\n";
    sum(1, 2);
    sum(1, 2, 3);
    print(42);
    print(3.14);
    print("C-string");
    print(std::string("std::string"));
    
    std::cout << "\n=== SECTION 2: TYPE CONVERSIONS ===\n";
    char c = 'A';
    func_promotion(c);  // char promoted to int
    func_standard(42);   // int matches int version
    func_standard(3.14f); // float converted to double
    func_preference('A'); // char promoted to int (preferred over conversion to double)
    
    std::cout << "\n=== SECTION 3: CONST QUALIFIERS ===\n";
    int x = 10;
    const int cx = 20;
    func_const(&x);      // calls non-const version
    func_const(&cx);     // calls const version
    func_const_ref(x);   // calls non-const reference
    func_const_ref(cx);  // calls const reference
    func_const_ref(30);  // calls const reference (temporary)
    
    MyClass obj;
    const MyClass const_obj;
    obj.method();        // calls non-const version
    const_obj.method();  // calls const version
    
    std::cout << "\n=== SECTION 4: REFERENCES ===\n";
    int val = 100;
    func_ref_val(val);     // calls value version (copy)
    func_ref_val(200);     // calls value version (temporary rvalue)
    func_rvalue(300);      // calls rvalue reference version
    func_rvalue(val);      // calls const reference version
    
    std::cout << "\n=== SECTION 5: USER-DEFINED CONVERSIONS ===\n";
    Integer integer(42);
    func_user_conv(integer);  // Integer->int via operator int()
    func_user_conv(3.14);     // direct call with double
    func_user_conv(static_cast<int>(integer));  // explicit cast avoids ambiguity
    
    std::cout << "\n=== SECTION 6: ARRAYS ===\n";
    int arr[5] = {1, 2, 3, 4, 5};
    func_array(arr);           // array decays to pointer (same as int*)
    func_array_size(arr);      // array with size hint (still decays)
    func_array_ref(arr);       // reference to array (no decay, preserves type)
    
    std::cout << "\n=== SECTION 7: DEFAULT ARGUMENTS ===\n";
    // func_default(5);  // AMBIGUOUS - uncomment to see error
    func_default_good(5);      // calls one-arg version
    func_default_good(5, 10);  // calls two-arg version
    
    std::cout << "\n=== SECTION 8: TEMPLATES ===\n";
    func_template(42);         // calls non-template (exact match preferred)
    func_template(3.14);       // calls template version
    func_template(std::string("test"));  // calls template version
    func_template_pref(42);    // non-template preferred over template
    
    std::cout << "\n=== SECTION 9: VARIADIC ===\n";
    func_variadic(42);         // calls int version
    func_variadic("%d", 42);   // calls variadic version
    
    std::cout << "\n=== SECTION 10: REF-QUALIFIERS ===\n";
    RefQualified rq;
    rq.method();               // calls & version
    RefQualified().method();   // calls && version
    const RefQualified const_rq;
    const_rq.method();         // calls const & version
    
    std::cout << "\n=== SECTION 11: RESOLUTION RANKING ===\n";
    char ch = 'B';
    resolve_promotion(ch);     // promotion preferred over conversion
    resolve_standard(42);      // exact match preferred over conversion
    Integer int_obj(100);
    resolve_user(static_cast<int>(int_obj));  // explicit cast to avoid ambiguity
    
    std::cout << "\n=== SECTION 12: AMBIGUITY (commented to avoid errors) ===\n";
    // func_ambiguous_class(42);  // AMBIGUOUS - uncomment to see error
    // func_rank(10, 20);         // AMBIGUOUS - uncomment to see error
    
    std::cout << "\n=== SECTION 13: ADL ===\n";
    MyNamespace::MyType mt(42);
    // Note: adl_func(mt) would be ambiguous between global and namespace versions
    // Use explicit qualification to disambiguate:
    MyNamespace::adl_func(mt); // explicitly call namespace version
    adl_func(42);              // calls MyNamespace version (not global, only namespace has int overload)
    
    std::cout << "\n=== SECTION 14: FRACTION CONVERSIONS ===\n";
    Fraction frac(5, 2);
    func_fraction(static_cast<int>(frac));     // explicit cast to avoid ambiguity
    
    std::cout << "\n=== SECTION 16: INITIALIZER LIST ===\n";
    func_initializer({1, 2, 3, 4, 5});         // initializer_list
    
    std::cout << "\n=== SECTION 17: INHERITANCE ===\n";
    Derived d;
    d.overload(42);            // calls Derived::overload(int)
    d.overload(3.14);          // calls Derived::overload(double)
    
    std::cout << "\n=== SECTION 19: COMPLEX SCENARIOS ===\n";
    complex_scenario(42);      // calls non-template overload
    complex_scenario(3.14);    // calls template version
    forwarding(42);            // calls forwarding(int), not template
    
    std::cout << "\n=== END OF DEMONSTRATIONS ===\n";
    
    return 0;
}

/*
 * KEY TAKEAWAYS AND BEST PRACTICES:
 * 
 * 1. Overload resolution follows a strict ranking:
 *    Exact match > Promotion > Standard conversion > User-defined > Ellipsis
 * 
 * 2. Non-template functions are preferred over template functions when
 *    resolution rank is equal.
 * 
 * 3. Avoid ambiguity by:
 *    - Not mixing default arguments with overloads
 *    - Being careful with user-defined conversions
 *    - Understanding const/volatile qualifiers
 * 
 * 4. Use explicit casts when ambiguity arises rather than relying on
 *    compiler's choice.
 * 
 * 5. Template specialization doesn't participate in overload resolution
 *    the same way non-template overloads do.
 * 
 * 6. ADL can bring in unexpected function candidates from associated
 *    namespaces.
 * 
 * 7. Ref-qualifiers allow overloading based on value category (lvalue/rvalue).
 * 
 * 8. Inheritance can hide base class overloads - use 'using' to bring
 *    them into scope.
 */
