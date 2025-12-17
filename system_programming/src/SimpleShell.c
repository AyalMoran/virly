/******************
 Author  : Ayal Moran
 Reviewer: Daniel N.
 Date    : 17-12-25
 *****************/

#define _POSIX_C_SOURCE 200809L
#define _GNU_SOURCE

#include <errno.h>           /* errno      */
#include <stdio.h>           /* printf     */
#include <stdlib.h>          /* malloc     */
#include <string.h>          /* strcmp     */
#include <sys/wait.h>        /* waitpid    */
#include <unistd.h>          /* fork       */
#include <assert.h>          /* assert     */

#include "SimpleShell.h"   /* SimpleShell   */

#define TRUE (1)
#define FALSE (0)
#define SUCCESS (0)
#define FAILURE (1)

#define TOKEN_BUFSIZE (64)
#define TOKEN_DELIMITERS " \t\r\n\a"

/*============================FORWARD DECLs==================*/
static int ShellCD(char** args);
static int ShellExit(char** args);
static int NumOfBuiltins(void);

static void CheckExpression(int expr, const char* msg);
static char* ReadLine(void);
static char** SplitLine(char* line);
static int LaunchFork(char** args);
static int LaunchSystem(char const* line);
static void ShellLoop(int use_fork);

static char* BUILTIN_STR[] = {"cd", "exit"};

static int (*BUILTIN_FUNC[])(char**) = {&ShellCD, &ShellExit};

/*============================ API  ============================*/
void SimpleShell(void)
{
    int option = 0;
    int keep_running = TRUE;
    
    printf("*** ILRD Simple Shell ***\n"
           "Choose execution mode:\n"
           "  1  – fork + execvp\n"
           "  2  – system()\n"
           "=> ");

    while(TRUE == keep_running)
    {
        scanf("%d", &option);
        getchar();
        
        switch (option)
        {
            case 1: 
                ShellLoop(TRUE);
                keep_running = FALSE;
                break;
            case 2: 
                ShellLoop(FALSE);
                keep_running = FALSE;
                break;
            default: 
                fprintf(stderr, "simple-shell: illegal option\n");
        }
    }

    return;
}

/*============================SHELL LOOP===========================*/
static void ShellLoop(int use_fork)
{
    char*  line         = NULL;
    char** args         = NULL;
    int    keep_running = TRUE;
    int    i            = 0;

    while (TRUE == keep_running)
    {
        fputs("> ", stdout);
        fflush(stdout);

        line = ReadLine();
        args = SplitLine(line);

        if (NULL == args[0])
        {
            free(args);
            free(line);
            continue;
        }

        for (i = 0; i < NumOfBuiltins(); ++i)
        {
            if (0 == strcmp(args[0], BUILTIN_STR[i]))
            {
                keep_running = (*BUILTIN_FUNC[i])(args);
                break;
            }
        }
        if (i < NumOfBuiltins())
        {
            free(args);
            free(line);
            continue;
        }

        if (TRUE == use_fork)
        {
            keep_running = LaunchFork(args);
        }
        else
        {
            keep_running = LaunchSystem(line);
        }

        free(args);
        free(line);
    }
}

/*=========================================================*/
static char* ReadLine(void)
{
    char*  line    = NULL;
    size_t bufsize = 0;

    if (-1 == getline(&line, &bufsize, stdin))
    {
        if (feof(stdin))
        {
            exit(EXIT_SUCCESS);
        }
        perror("simple-shell: getline");
        exit(EXIT_FAILURE);
    }
    return line;
}
/*----------------------------------------------------------------------*/
static char** SplitLine(char* line)
{
    int    bufsize  = TOKEN_BUFSIZE;
    int    position = 0;
    char*  token    = NULL;
    char** tokens   = NULL;

    assert(NULL != line);

    tokens = (char**) malloc(bufsize * sizeof(char*));
    CheckExpression(NULL != tokens, "Split Line: malloc;");

    token = strtok(line, TOKEN_DELIMITERS);
    while (NULL != token)
    {
        tokens[position] = token;
        ++position;

        if (position >= bufsize)
        {
            bufsize += TOKEN_BUFSIZE;
            tokens   = (char**) realloc(tokens, bufsize * sizeof(char*));
            CheckExpression(NULL != tokens, "Split Line: realloc");
        }

        token = strtok(NULL, TOKEN_DELIMITERS);
    }

    tokens[position] = NULL;
    return tokens;
}
/*----------------------------------------------------------------------*/
static int LaunchFork(char** args)
{
    pid_t pid    = fork();
    int   status = 0;

    CheckExpression(-1 != pid, "fork");

    assert(NULL != args);

    if (0 == pid)
    {
        CheckExpression(-1 != execvp(args[0], args), "simple-shell: execvp");
    }
    else
    {
        while (-1 == waitpid(pid, &status, 0))
        {
            if (EINTR != errno)
            {
                perror("simple-shell: waitpid");
                break;
            }
        }
    }
    return TRUE;
}
/*----------------------------------------------------------------------*/
static int LaunchSystem(char const* line)
{
    int ret = 0;

    assert(NULL != line);

    ret = system(line);

    if (-1 == ret)
    {
        perror("simple-shell: system");
    }
    else if (WIFEXITED(ret) && 0 != WEXITSTATUS(ret))
    {
        fprintf(stderr, "simple-shell: child returned %d\n", WEXITSTATUS(ret));
    }
    else if (WIFSIGNALED(ret))
    {
        fprintf(stderr, "simple-shell: child killed by signal %d\n",
                WTERMSIG(ret));
    }
    return TRUE;
}

/*========================================================*/
static int ShellCD(char** args)
{
    assert(NULL != args);

    if (NULL == args[1])
    {
        fputs("simple-shell: expected argument to \"cd\"\n", stderr);
    }
    else if (-1 == chdir(args[1]))
    {
        perror("simple-shell: cd");
    }
    return TRUE;
}

/*----------------------------------------------------------------------*/
static int ShellExit(char** args)
{
    assert(NULL != args);

    (void) args;

    return FALSE;
}
/*----------------------------------------------------------------------*/
static int NumOfBuiltins(void)
{
    return (int) (sizeof(BUILTIN_STR) / sizeof(BUILTIN_STR[0]));
}

static void CheckExpression(int expr, const char* msg)
{
    if (NULL == expr)
    {
        perror(msg);
        exit(EXIT_FAILURE);
    }
}