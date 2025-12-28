/******************
 Author : Ayal Moran
 Reviewer:
 Date:
 *****************/
#include <stdio.h>
#include <stdlib.h>
#include <sys/types.h> /* ssize_t */
#include <stddef.h>
#include <string.h>
#include <locale.h>

#include "cbuff.h"

/* General Formatting */
#define RESET                    (0)
#define BRIGHT                   (1)
#define DIM                      (2)
#define UNDERSCORE               (3)
#define BLINK                    (4)
#define REVERSE                  (5)
#define HIDDEN                   (6)

/* Foreground Colors */
#define FG_BLACK                 (30)
#define FG_RED                   (31)
#define FG_GREEN                 (32)
#define FG_YELLOW                (33)
#define FG_BLUE                  (34)
#define FG_MAGENTA               (35)
#define FG_CYAN                  (36)
#define FG_WHITE                 (37)

/* Background Colors */
#define BG_BLACK                 (40)
#define BG_RED                   (41)
#define BG_GREEN                 (42)
#define BG_YELLOW                (43)
#define BG_BLUE                  (44)
#define BG_MAGENTA               (45)
#define BG_CYAN                  (46)
#define BG_WHITE                 (47)

/* Macro to set print color */
#define SET_PRINT_COLOR(X) printf("\x1b[%dm", X)

/* Macro to run tests */
#define RUN_TEST(desc, expr)                \
    do {                                    \
        ++total_tests;                      \
        if (expr)                           \
        {                                   \
            ++passed_tests;                 \
            SET_PRINT_COLOR(FG_GREEN);      \
            SET_PRINT_COLOR(BRIGHT);        \
            printf("[PASS] %s\n", desc);    \
            SET_PRINT_COLOR(RESET);         \
        } else {                            \
            SET_PRINT_COLOR(FG_RED);        \
            SET_PRINT_COLOR(BRIGHT);        \
            printf("[FAIL] %s\n", desc);    \
            SET_PRINT_COLOR(RESET);         \
        }                                   \
    } while (0)

int total_tests = 0;
int passed_tests = 0;

static void Test_Create(void)
{
    size_t capacity_test;
    c_buffer_t* c_buffer;

    capacity_test = 16;
    c_buffer = CBuffCreate(capacity_test);
   
    RUN_TEST("Create: Data structure creation returns non-NULL", (NULL != c_buffer));
    RUN_TEST("Create: c_buffer->capacity after CBuffCreate(16) returns 16", (16 == CBuffFreeSpace(c_buffer)));
    
    CBuffDestroy(c_buffer);
}


static void Test_Write(void)
{
    c_buffer_t* cb;
    char *src;
    size_t bytes_written;

    cb = CBuffCreate(16);
    /* writing a string to buffer */
    {
        src = "this is a test";
        bytes_written = CBuffWrite(cb, src, strlen(src) + 1);
        RUN_TEST("Write: written exactly strlen(src)+1 to buffer", (bytes_written == (strlen(src) + 1)));
    }
    CBuffDestroy(cb);
}

static void Test_Read(void)
{
    c_buffer_t* cb;
    char *src;
    char *dest;
    size_t bytes_written;
    size_t bytes_read;
	bytes_written = 0;
	bytes_written+=1;/*annoying warning*/
    cb = CBuffCreate(16);
    /* reading string from buffer */
    {
        src = "this is a test";
        dest = (char*) malloc(strlen(src) + 1);
        bytes_written = CBuffWrite(cb, src, strlen(src) + 1);
        bytes_read = CBuffRead(cb, dest, strlen(src) + 1);
        
        RUN_TEST("Read: Read exactly strlen(src)+1 from buffer", (bytes_read == (strlen(src) + 1)));
        RUN_TEST("Read: strcmp(dest,src)", (strcmp(dest, src) == 0));
        
        /* writing after the buffer is not empty */
        src = "123456789012345";
        CBuffWrite(cb, src, strlen(src) + 1);
        CBuffRead(cb, dest, strlen(src) + 1);
        
        RUN_TEST("Read: strcmp(dest,src) after second write/read", (strcmp(dest, src) == 0));
        /* writing an input bigger than buffer while buffer is empty */
        /* checking if we only get the size of the buffer */
        src = "12345678901234533333";
        CBuffWrite(cb, src, strlen(src) + 1);
        CBuffRead(cb, dest, strlen(src) + 1);
        
        RUN_TEST("Read: writing an input bigger than buffer strcmp(dest,src)", (strcmp(dest, src) != 0));
        
        free(dest);
        CBuffDestroy(cb);
    }
    
    
        /* Second part of Test_Read */
    {
        char *src2;
        char *dest2;
        size_t len;
        size_t i = 0;
        ssize_t read_bytes;
        char fullbuff[9];
        src2 = "12345";
        len = strlen(src2);
        dest2 = (char*) malloc(7);
        cb = CBuffCreate(8);
        
        SET_PRINT_COLOR(FG_CYAN);
        printf("writing %lu bytes to buffer\n", (unsigned long)len);
        CBuffWrite(cb, src2, len);
        CBuffWrite(cb, "00000", 5); /*after: buffer os 12345000*/
        printf("writing another extra 5 bytes to buffer\n");
        CBuffRead(cb, dest2, 7);/*after: buffer is 0*/
        printf("dest is %s \n", dest2);
        SET_PRINT_COLOR(RESET);
        
        RUN_TEST("Read: writing an input bigger than buffer strcmp(dest,src) second case",(strcmp(dest2, "1234500") == 0));
                 
        read_bytes = CBuffRead(cb, fullbuff, 8);
        RUN_TEST("Read: Reading 8 bytes from a buffer of size 1 returns 1",(read_bytes == 1));
        RUN_TEST("Read: Reading 8 bytes from a buffer of size 1 empties the buffer",(0 == CBuffSize(cb)));
        
        fullbuff[read_bytes] = '\0'; /*null terminating because else it prints garbage*/

        
        CBuffWrite(cb, "1111", 4);
        CBuffRead(cb, dest2, 4);

        CBuffWrite(cb, "!", 1);

        while (dest2[i] != '5')
        {
        	++i;
        }
        CBuffRead(cb, dest2+i, 1);/*changing the '5' to '!'*/

        RUN_TEST("Read: Reading ! from buffer into the middle of a string",!(strcmp(dest2,"1111!00")));
        
        
        free(dest2);
    }
    CBuffDestroy(cb);
    
}

static void Test_Empty(void)
{
    size_t capacity_test;
    c_buffer_t* cb;
    char *src;
    char *src2;
    char *dest;
    char *dest2;
    capacity_test = 16;
    cb = CBuffCreate(capacity_test);
    src = "this is a test!";
    src2 = "12345";
    dest = (char*) malloc(strlen(src));
    dest2 = (char*) malloc(strlen(src2));

    CBuffWrite(cb, src, 9);
    CBuffRead(cb, dest, 9);
    
    CBuffWrite(cb, src, 9);
    CBuffRead(cb, dest, 9);
    
    CBuffWrite(cb, src, 9);
    CBuffRead(cb, dest, 4);
    CBuffRead(cb, dest, 5);
    
    CBuffWrite(cb, src, 9);
    CBuffWrite(cb, src, 9);
    CBuffWrite(cb, src, 9);
    CBuffRead(cb, dest, 4);
    CBuffRead(cb, dest, 5);
    CBuffRead(cb, dest, 4);
    CBuffRead(cb, dest, 5);
    CBuffRead(cb, dest, 4);
    CBuffRead(cb, dest, 5);
    
    RUN_TEST("Empty: Writing and then Reading the same amount of bytes results in an empty buffer", (CBuffIsEmpty(cb)));
    
    CBuffWrite(cb, src, strlen(src));
    CBuffRead(cb, dest, strlen(src)-1);
    CBuffWrite(cb, src2, 6);
    CBuffRead(cb, dest2, 7);
    printf("%s \n", dest);
    printf("%s \n", dest2);
    
    free(dest);
    free(dest2);
    CBuffDestroy(cb);
}


 
/* Test writing to a full buffer and free space */
static void Test_FullBuffer(void)
{
    c_buffer_t* cb;
    char src[11] = "1234567890";  /* 10 bytes */
    ssize_t written;
    char extra;
    ssize_t extra_write;
    cb = CBuffCreate(10);
    
    written = CBuffWrite(cb, src, 10);
    RUN_TEST("FullBuffer: Write exactly full capacity returns 10", (written == 10));
    
    /* write one more byte, which should fail */
    extra = 'a';
    extra_write = CBuffWrite(cb, &extra, 1);
    RUN_TEST("FullBuffer: Write to full buffer returns -1", (extra_write == -1));
    
    /* Verify that free space is 0 */
    RUN_TEST("FullBuffer: Free space is 0 after full write", (CBuffFreeSpace(cb) == 0));
    
    CBuffDestroy(cb);
}

/*  reading from an empty buffer should fail */
static void Test_ReadFromEmpty(void)
{
    c_buffer_t* cb;
    char dest[10];
    ssize_t read_bytes;
    cb = CBuffCreate(10);
    
    memset(dest, 0, sizeof(dest));
    read_bytes = CBuffRead(cb, dest, 5);
    RUN_TEST("ReadFromEmpty: Reading from an empty buffer returns -1", (read_bytes == -1));
    
    CBuffDestroy(cb);
}

/*  size and free space consistet after write and read operations */
static void Test_SizeAndFreeSpace(void)
{
    c_buffer_t* cb;
    char src[11] = "abcdefghij";  /*10*/
    ssize_t written;
    char dest[11];
    ssize_t read_bytes;
    cb = CBuffCreate(20);
    
    written = CBuffWrite(cb, src, 10);
    RUN_TEST("SizeAndFreeSpace: Write returns 10", (written == 10));
    
    RUN_TEST("SizeAndFreeSpace: CBuffSize returns 10", (CBuffSize(cb) == 10));
    RUN_TEST("SizeAndFreeSpace: CBuffFreeSpace returns 10", (CBuffFreeSpace(cb) == 10));
    
    memset(dest, 0, sizeof(dest));
    read_bytes = CBuffRead(cb, dest, 5);
    RUN_TEST("SizeAndFreeSpace: Read returns 5", (read_bytes == 5));
    RUN_TEST("SizeAndFreeSpace: CBuffSize returns 5 after read", (CBuffSize(cb) == 5));
    RUN_TEST("SizeAndFreeSpace: CBuffFreeSpace returns 15 after read", (CBuffFreeSpace(cb) == 15));
    
    CBuffDestroy(cb);
}

/*  buffer wrap around modular  */
static void Test_WrapAround(void)
{
    c_buffer_t* cb;
    char src1[6] = "12345";  /*5*/
    char src2[6] = "ABCDE";  /*5/*/
    char dest[8];
    char dest_partial[6];
    char expected[8] = "45ABCDE";/*7*/
    char actual[8];
    char full_dest[10];
    ssize_t written1;
    ssize_t read1;
    ssize_t written2;
    ssize_t read2;

	/*BUFFER SIZE IS 10!!!!!*/
    cb = CBuffCreate(10);
    /*yani in awanta shel calloc*/
    memset(dest, 0, sizeof(dest));
    memset(dest_partial, 0, sizeof(dest_partial));
    memset(actual, 0, sizeof(actual));

    written1 = CBuffWrite(cb, src1, 5);
    RUN_TEST("WrapAround: Write 5 bytes returns 5", (written1 == 5));
    
    read1 = CBuffRead(cb, dest_partial, 3);
    RUN_TEST("WrapAround: Read 3 bytes returns 3", (read1 == 3));
    RUN_TEST("WrapAround: the above 3 Bytes are as Expected", strcmp(dest_partial, "123000"));
    
    written2 = CBuffWrite(cb, src2, 5);
    RUN_TEST("WrapAround: Write additional 5 bytes returns 5", (written2 == 5));
    
    RUN_TEST("WrapAround: CBuffSize returns 7", (CBuffSize(cb) == 7));
    
    read2 = CBuffRead(cb, actual, 7);
    RUN_TEST("WrapAround: Final read returns 7", (read2 == 7));
    RUN_TEST("WrapAround: Read data matches expected wrapped data", (strcmp(actual, expected) == 0));
    
    CBuffWrite(cb, src1, 5);
    CBuffWrite(cb, src1, 5);
    /*buffer = 1234512345*/
    
    CBuffRead(cb, dest_partial, 3);
    /*buffer = 4512345*/
    
    written2 = CBuffWrite(cb, src2, 5);/* should return be 3*/
    /*buffer = 4512345ABC*/
    RUN_TEST("WrapAround: Writing 5 bytes (too much) returns 3", (written2 == 3));
    
    read2 = CBuffRead(cb, full_dest, 50);/*should return 10*/
    RUN_TEST("WrapAround: Reading 50 bytes (too much) returns 10", (read2 == 10));    
    RUN_TEST("WrapAround: Read data matches expected wrapped data", 
    !(strcmp(full_dest,"4512345ABC")));
    
    CBuffDestroy(cb);
    
}

/*  writing and reading 0 bytes */
static void Test_ZeroWriteAndRead(void)
{
    c_buffer_t* cb;
    char dummy;
    ssize_t written;
    char dest;
    ssize_t read_bytes;
    cb = CBuffCreate(10);
    
    dummy = 'x';
    written = CBuffWrite(cb, &dummy, 0);
    RUN_TEST("ZeroWrite: Writing 0 bytes returns 0", (written == 0));
    written = CBuffWrite(cb, "test", 1);
    read_bytes = CBuffRead(cb, &dest, 0);

    RUN_TEST("ZeroRead: Reading 0 bytes from non-empty buffer returns 0", (read_bytes == 0));
    
    CBuffDestroy(cb);
}

int main(void)
{
    size_t max_size = (size_t)-1;
    Test_Create();
    /* Test_Destroy(); on NULL may crash program */
    Test_Write();
    Test_Read();
    Test_Empty();
    Test_FullBuffer();
    Test_ReadFromEmpty();
    Test_SizeAndFreeSpace();
    Test_WrapAround();
    Test_ZeroWriteAndRead();

    setlocale(LC_NUMERIC, "");
	printf("max value of size_t is:%'lu Bytes\n", max_size);    
    SET_PRINT_COLOR(BG_BLACK);
    printf("=== Test Results: %d passed / %d total ===", passed_tests, total_tests);
    SET_PRINT_COLOR(RESET);
    printf("\n");
    return 0;
}

