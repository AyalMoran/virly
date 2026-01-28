/*************************************
 * RCString.hpp
 * Author: Ayal Moran
 * Reviewer: Yehuda F
 * Date: 27-01-2026
 */
#ifndef ILRD_RCSTRING_HPP
#define ILRD_RCSTRING_HPP

#include <cstring>
#include <cstdlib>
#include <iostream>

/**
 * @briefILRD (Infinity Labs R&D) 
 */
namespace ilrd
{

/**
 * @brief Forward declaration of RCString class
 */
class RCString;

/**
 * @brief Forward declaration of Proxy class
 */
class Proxy;

/**
 * @brief Stream insertion operator for RCString
 * 
 * Outputs the string content to the given output stream.
 * 
 * @param os Output stream to write to
 * @param str RCString object to output
 * @return Reference to the output stream
 */
inline std::ostream& operator<<(std::ostream& os, const RCString& str);

/**
 * @brief Equality comparison operator for RCString
 * 
 * Compares two RCString objects for equality by comparing their string contents.
 * 
 * @param lhs_ Left-hand side RCString operand
 * @param rhs_ Right-hand side RCString operand
 * @return true if strings are equal, false otherwise
 */
inline bool operator==(const RCString& lhs_, const RCString& rhs_);

/**
 * @brief Inequality comparison operator for RCString
 * 
 * Compares two RCString objects for inequality by comparing their string contents.
 * 
 * @param lhs_ Left-hand side RCString operand
 * @param rhs_ Right-hand side RCString operand
 * @return true if strings are not equal, false otherwise
 */
inline bool operator!=(const RCString& lhs_, const RCString& rhs_);

/**
 * @brief Less-than comparison operator for RCString
 * 
 * Performs lexicographic comparison of two RCString objects.
 * 
 * @param lhs_ Left-hand side RCString operand
 * @param rhs_ Right-hand side RCString operand
 * @return true if lhs_ is lexicographically less than rhs_, false otherwise
 */
inline bool operator<(const RCString& lhs_, const RCString& rhs_);

/**
 * @brief Greater-than comparison operator for RCString
 * 
 * Performs lexicographic comparison of two RCString objects.
 * 
 * @param lhs_ Left-hand side RCString operand
 * @param rhs_ Right-hand side RCString operand
 * @return true if lhs_ is lexicographically greater than rhs_, false otherwise
 */
inline bool operator>(const RCString& lhs_, const RCString& rhs_);

/**
 * @brief Reference-counted string class
 * 
 * RCString implements a copy-on-write string class that uses reference counting.
 *  Multiple RCString objects can share the same
 * string until a write operation.
 */
class RCString
{
  public:
    /**
     * @brief Constructs an RCString from a C-style string
     * 
     * Creates a new RCString object with the given C-style string.
     * If no string is provided, creates an empty string.
     * 
     * @param cstr C-style null-terminated string (default: empty string)
     */
    RCString(const char* cstr = "");
    
    /**
     * @brief Copy constructor
     * 
     * Creates a new RCString that shares the same underlying data as the
     * source RCString.
     * 
     * @param other Source RCString to copy from
     */
    RCString(const RCString& other);
    
    /**
     * @brief Destructor
     * 
     * Decrements the reference count. If the count reaches zero,
     * the underlying state is destroyed.
     */
    ~RCString();

    /**
     * @brief Copy assignment operator
     * 
     * Assigns the contents of another RCString to this object.
     * 
     * @param other Source RCString to assign from
     * @return Reference to this RCString object
     */
    RCString& operator=(const RCString& other);

    /**
     * @brief Returns a C-style string representation
     * 
     * Returns a pointer to the underlying null-terminated C-style string.
     * The returned pointer is valid as long as the RCString object exists.
     * 
     * @return Pointer to the null-terminated C-style string
     */
    inline const char* ToCStr() const;
    
    /**
     * @brief Returns the length of the string
     * 
     * Calculates and returns the length of the string (excluding the null terminator).
     * 
     * @return Length of the string in characters
     */
    inline size_t Length() const;

    /**
     * @brief Proxy class for non-const subscript operator
     * 
     * The Proxy class enables copy-on-write semantics for the non-const
     * subscript operator.
     */
    class Proxy
    {
      public:
        /**
         * @brief Constructs a Proxy object
         * 
         * Creates a proxy that references a specific character in an RCString.
         * 
         * @param str Reference to the RCString object
         * @param index Index of the character to access
         */
        Proxy(RCString& str, size_t index);
        
        /**
         * @brief Assignment operator for Proxy
         * 
         * Assigns a character value to the referenced position in the RCString.
         * This operation triggers copy-on-write if necessary.
         * 
         * @param c Character value to assign
         * @return Reference to this Proxy object
         */
        Proxy& operator=(char c);
        
        /**
         * @brief Conversion operator to char
         * 
         * Allows the Proxy to be implicitly converted to a char value,
         * enabling read operations through the proxy.
         * 
         * @return Character value at the referenced position
         */
        operator char() const;

      private:
        RCString& m_str;    /**< Reference to the RCString object */
        size_t m_index;     /**< Index of the character being accessed */
    };

    /**
     * @brief Const subscript operator
     * 
     * Returns the character at the specified index for read-only access.
     * This operator does not trigger copy-on-write.
     * 
     * @param index Index of the character to access
     * @return Character value at the specified index
     */
    char operator[](size_t index) const;
    
    /**
     * @brief Non-const subscript operator
     * 
     * Returns a Proxy object that allows both reading and writing the character
     * at the specified index.
     * 
     * @param index Index of the character to access
     * @return Proxy object for the character at the specified index
     */
    Proxy operator[](size_t index);

  private:
    /**
     * @brief Internal state structure for reference counting
     * 
     * The State structure holds the reference count and the actual string data.
     */
    struct State
    {
        size_t m_ref_count;  /**< Reference count for this state */
        char m_cstr[1];      /**< Flexible array member for the string data */
    };
    
    State* m_state;  /**< Pointer to the shared state */

    /**
     * @brief Detaches this RCString from shared state
     * 
     * Creates a copy of the current state if it's shared with other RCString
     * objects. This is called before modifications to implement copy-on-write.
     */
    void Detach();
    
    /**
     * @brief Creates a new State object
     * 
     * Allocates memory for a new State object with the given string content.
     * The reference count is initialized to 1.
     * 
     * @param cstr C-style string to store in the state
     * @return Pointer to the newly created State object
     */
    static State* CreateState(const char* cstr);
    
    /**
     * @brief Destroys a State object
     * 
     * Deallocates the memory for a State object. Should only be called
     * when the reference count reaches zero.
     * 
     * @param state Pointer to the State object to destroy
     */
    static void DestroyState(State* state);
};

/**
 * @brief Returns a C-style string representation
 * 
 * @return Pointer to the null-terminated C-style string
 */
inline const char* RCString::ToCStr() const
{
    return m_state->m_cstr;
}

/**
 * @brief Returns the length of the string
 * 
 * @return Length of the string in characters
 */
inline size_t RCString::Length() const
{
    return std::strlen(m_state->m_cstr);
}

/**
 * @brief Equality comparison operator for RCString
 * 
 * @param lhs_ Left-hand side RCString operand
 * @param rhs_ Right-hand side RCString operand
 * @return true if strings are equal, false otherwise
 */
inline bool operator==(const RCString& lhs_, const RCString& rhs_)
{
    return std::strcmp(lhs_.ToCStr(), rhs_.ToCStr()) == 0;
}

/**
 * @brief Inequality comparison operator for RCString
 * 
 * @param lhs_ Left-hand side RCString operand
 * @param rhs_ Right-hand side RCString operand
 * @return true if strings are not equal, false otherwise
 */
inline bool operator!=(const RCString& lhs_, const RCString& rhs_)
{
    return !(lhs_ == rhs_);
}

/**
 * @brief Less-than comparison operator for RCString
 * 
 * @param lhs_ Left-hand side RCString operand
 * @param rhs_ Right-hand side RCString operand
 * @return true if lhs_ is lexicographically less than rhs_, false otherwise
 */
inline bool operator<(const RCString& lhs_, const RCString& rhs_)
{
    return std::strcmp(lhs_.ToCStr(), rhs_.ToCStr()) < 0;
}

/**
 * @brief Greater-than comparison operator for RCString
 * 
 * @param lhs_ Left-hand side RCString operand
 * @param rhs_ Right-hand side RCString operand
 * @return true if lhs_ is lexicographically greater than rhs_, false otherwise
 */
inline bool operator>(const RCString& lhs_, const RCString& rhs_)
{
    return std::strcmp(lhs_.ToCStr(), rhs_.ToCStr()) > 0;
}

/**
 * @brief Stream insertion operator for RCString
 * 
 * @param os Output stream to write to
 * @param str RCString object to output
 * @return Reference to the output stream
 */
std::ostream& operator<<(std::ostream& os, const RCString& str)
{
    os << str.ToCStr();
    return os;
}
} // namespace ilrd

#endif // ILRD_RCSTRING_HPP

