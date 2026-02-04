#define TEMPLATE_MAX(T)         \
T Max_##T(T a, T b)             \
{                               \
    return a > b ? a : b;       \
}

/* main.c */
TEMPLATE_MAX(int)
TEMPLATE_MAX(double)

int main() 
{
    int a = Max_int(5, 6);
    float b = Max_double(5.5, 6.5);
    return 0;
}