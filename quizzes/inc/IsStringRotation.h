#ifndef ILRD_ISSTRINGROTATION_H
#define ILRD_ISSTRINGROTATION_H

/*
Implement a function that is given two strings and determines whether they are rotations of each other.

If one string is a rotation of the other, the function should return the index of the first string where the rotation starts, or -1 otherwise.

For example, the string ABCDAB is a rotation of the string ABABCD, with a starting index of 2, whereas the strings CDBA and ABCD are not. Likewise with the strings ABCD and ABCDE.

Constraints:
Allocation of additional memory is not allowed.
To get the length of a string, you can use strlen().
The expected complexity is O(n2).
*/

int IsStringRotation(const char* str1, const char* str2);

#endif /* ILRD_ISSTRINGROTATION_H */
