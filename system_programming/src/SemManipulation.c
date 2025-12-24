/**************************************************************
 * File    : SemManipulation.c
 * Author  : Ayal Moran
 * Reviewer: Chaya T.
 * Date    : 24-12-2025
**************************************************************/

/*============================ INCLUDES ============================*/
#include <assert.h>     /* assert   */
#include <fcntl.h>      /* O_CREAT  */
#include <semaphore.h>  /* sem_open */
#include <stddef.h>     /* size_t   */
#include <stdio.h>      /* perror   */
#include <stdlib.h>     /* malloc   */
#include <string.h>     /* strcspn  */

#include "SemManipulation.h" /* SemManipulation */

/*========================== DEFINITIONS ===========================*/
#define TRUE (1)
#define FALSE (0)
#define SUCCESS (0)
#define FAILURE (1)
#define MAX_OPS (1000)
#define INC (1)
#define DEC (0)
#define INIT_SEM_VAL (0)
/*========================== MACRO UTILS ===========================*/

/*========================= TYPEDEFS/ENUMS =========================*/
typedef struct undo_entry
{
    int amount;
    int is_increment;
} undo_entry_t;

undo_entry_t undo_stack[MAX_OPS];
int undo_size = 0;

sem_t* sem = NULL;

/*====================== STATIC DECLARATIONS =======================*/
static void ReceiveInput(sem_t* sem);

static void GetInput(char* input);

static void RunCommand(sem_t* sem, int number, char* command, int undo);

static void AddUndoEntry(int amount, int is_increment);

static void ParseCommandAndNumber(char* input, int* number, char** command, int* undo);

static void UndoAll(sem_t* sem);

static void ExitHandler(void);

/*========================= API FUNCTIONS ==========================*/
int SemManipulation(const char* name)
{
    sem = sem_open(name, O_CREAT, 0644, INIT_SEM_VAL);
    if (SEM_FAILED == sem)
    { 
        perror("sem_open failed");
    }

    atexit(ExitHandler);
    ReceiveInput(sem);

    exit(EXIT_SUCCESS);
}

/*======================= STATIC FUNCTIONS ========================*/
static void ReceiveInput(sem_t* sem)
{
    char input[100] = {0};
    char* command = NULL;
    int number = 0;
    int undo = 0;

    assert(NULL != sem);

    while (TRUE)
    {
        undo = 0;

        GetInput(input);
        ParseCommandAndNumber(input, &number, &command, &undo);
        RunCommand(sem, number, command, undo);
    }
}

static void GetInput(char* input)
{
    printf("Enter command (X to exit, V to view, D to decrement, I to "
           "increment): ");
    while (TRUE)
    {
        if (NULL == fgets(input, 100, stdin))
        {
            perror("fgets failed");
            exit(1);
        }
        if ('\n' == input[0] || '\0' == input[0])
        {
            continue;
        }

        break;
    }
}

static void RunCommand(sem_t* sem, int number, char* command, int undo)
{
    int sem_val = 0;
    int number_cpy = number;
    assert(NULL != sem);
    assert(NULL != command);
    
    switch (command[0])
    {
    case 'X':
        printf("Undoing and exiting...\n");

        exit(0);

    case 'V':
        if (0 == sem_getvalue(sem, &sem_val))
        {
            printf("The value of the semaphore is: %d\n", sem_val);
        }
        else
        {
            perror("sem_getvalue failed");
        }

        break;

    case 'D': 
        if (undo)
        {
            AddUndoEntry(number, DEC);
        }

        while (number > 0)
        {
            if (-1 == sem_wait(sem))
            {
                perror("sem_wait failed");
                return;
            }
            --number;
        }

        printf("Decremented semaphore by %d\n", number_cpy);
        break;

    case 'I':
        if (undo)
        {
            AddUndoEntry(number, INC);
        }

        while (number > 0)
        {
            if (-1 == sem_post(sem))
            {
                perror("sem_post failed");
                return;
            }
            --number;
        }

        printf("Incremented semaphore by %d\n", number_cpy);

        break;
    }
}

static void AddUndoEntry(int amount, int is_increment)
{
    if (undo_size < MAX_OPS)
    {
        undo_stack[undo_size].amount = amount;
        undo_stack[undo_size].is_increment = is_increment;
        ++undo_size;
    }
}

static void UndoAll(sem_t* sem)
{
    int i = 0;
    while (0 < undo_size)
    {
        --undo_size;

        if (0 == undo_stack[undo_size].is_increment)
        {
            for (i = 0; i < undo_stack[undo_size].amount; ++i)
            {
                if (-1 == sem_post(sem))
                {
                    perror("Undo (sem_post) failed");
                }
            }
        }
        else
        {
            for (i = 0; i < undo_stack[undo_size].amount; ++i)
            {
                if (-1 == sem_trywait(sem))
                {
                    perror("Undo (sem_trywait) failed - Semaphore Exhausted");
                    break;
                }
            }
        }
    }
}

static void ExitHandler(void)
{
    UndoAll(sem);
    sem_close(sem);
    sem = NULL;
}

static void ParseCommandAndNumber(char* input, int* number, char** command,
                                  int* undo)
{
    char* token = strtok(input, " ");
    if (NULL == token)
    {
        fprintf(stderr, "Invalid input format. Expected: <command> <number> "
                        "<undo_option>\n");
        return;
    }

    *command = token;

    token = strtok(NULL, " ");
    if (NULL == token)
    {
        return;
    }

    *number = atoi(token);

    if (0 >= *number)
    {
        fprintf(stderr, "Invalid number: must be > 0\n");
        return;
    }

    token = strtok(NULL, " ");
    if (NULL == token)
    {
        return;
    }

    token[strcspn(token, "\r\n")] = '\0';

    if (strcmp(token, "[undo]") == 0)
    {
        *undo = 1;
    }

    return;
}


