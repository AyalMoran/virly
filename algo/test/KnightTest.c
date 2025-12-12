/*
*************************************************************
 *  File        : KnightTest.c
 *  Author      : Ayal Moran
 *  Reviewer    : 
 *  Date        : 11-12-2025
 **************************************************************/
 #include <stdio.h>
 #include <stdlib.h>
 #include <string.h>
 #include <assert.h>
 
 #include "Knight.h"
 #include "bits_arr.h"
 #include "test_utils.h"
 #include <pthread.h>
 #include <signal.h>

 
 /******************************************************
  * START OF ACTUAL TESTS
  ******************************************************/
  /*
  volatile int did_knight_solve = 0;
  static void* ThreadRoutine(void* arg)
  {
    pid_t pid = getpid();
    size_t timeout = (size_t)arg;
    time_t start_time = time(NULL);
    
    while((time(NULL) - start_time) < timeout)
    {
        sleep(1);
    }
    if(did_knight_solve == 0)
    {
        kill(pid, SIGKILL);
    }
    return (void*)KNIGHT_SUCCESS;
}
*/
 static unsigned int KnightTourGetRow(pos_xy_t point)
 {
    return point >> 4;
 }
 static unsigned int KnightTourGetColumn(pos_xy_t point)
 {
    return point & 0x07;
 }
 static size_t ConvertPointToIndex(pos_xy_t point)
 {
     unsigned int row = KnightTourGetRow(point);
     unsigned int col = KnightTourGetColumn(point);
     return row * BOARD_DIM + col;
 }

static char* ConvertIndexToSquare(size_t index)
{
   char* str = (char*)malloc(3 * sizeof(char));
   if(str == NULL)
   {
       return NULL;
   }
   sprintf(str, "%c%c", (char)('A' + index / BOARD_DIM), (char)('1' + index % BOARD_DIM));
   return str;
}

 static void PrintKnightPath(char *squares[], size_t num_moves)
 {
     int board[BOARD_DIM][BOARD_DIM];
     size_t i;
     int r, c;
     int prev_row = 0;
     int prev_col = 0;
     int prev_prev_row = 0;
     int prev_prev_col = 0;
    
     for (r = 0; r < BOARD_DIM; ++r)
     {
         for (c = 0; c < BOARD_DIM; ++c)
         {
             board[r][c] = 0;
         }
     }
 
     for (i = 0; i < num_moves; ++i)
     {
         char *sq = squares[i];
         char file = 0;
         char rank = 0;
         int col = 0;
         int row = 0;
 
         if (sq == NULL || sq[0] == '\0' || sq[1] == '\0')
         {
             continue;
         }
 
         file = sq[0];
         rank = sq[1];
 
         prev_prev_row = prev_row;
         prev_prev_col = prev_col;

         col = file - 'A';
         row = rank - '1';
         
         board[row][col] = (int)(i + 1);

         prev_row = row;
         prev_col = col;

         printf("================================\n");
         for (r = 0; r < BOARD_DIM; ++r)
         {
             for (c = 0; c < BOARD_DIM; ++c)
             {
                if (board[r][c] > 0)
                {  
                    if(prev_row == r && prev_col == c)
                    {
                        SET_PRINT_COLOR(FG_GREEN);
                    }
                    else if(prev_prev_row == r  && prev_prev_col == c )
                    {
                        SET_PRINT_COLOR(FG_RED);
                    }
                    else
                    {
                        SET_PRINT_COLOR(RESET);
                    }
                    printf("[%2d]", board[r][c]);
                    SET_PRINT_COLOR(RESET);
                }
                else
                {
                    printf("[  ]");
                    
                }
            }
            printf("\n");
        }
    }
 }
 
 static void RunKnightsTour(pos_xy_t pos)
 {
    path_t res_path = {0};
    size_t i = 0;
    INIT_SUITE(backtrack, "BACKTRACK");
    char* squares[BOARD_SIZE];
    /*
    pthread_t thread = 0;

    if(pthread_create(&thread, NULL, ThreadRoutine, (void*)300) != 0)
    {
        printf("Failed to create thread\n");
        return;
    }*/

    /* 0b 0111 0111 == 119*/
    RUN_TEST(backtrack, "BACKTRACK", KnightSolveBacktracking(pos, res_path) == KNIGHT_SUCCESS);
    printf("Path In Indices:\n ");
    for (i = 0; i < BOARD_SIZE; ++i)
    {
        printf("%lu ", ConvertPointToIndex((pos_xy_t)res_path[i]));
    }
    printf("\n");
    printf("Path In Squares:\n ");
    for (i = 0; i < BOARD_SIZE; ++i)
    {
        squares[i] = ConvertIndexToSquare(ConvertPointToIndex((pos_xy_t)res_path[i]));
        printf("%s ", squares[i]);
    }
    printf("\n");
    printf("Chessboard:\n");
    PrintKnightPath(squares, BOARD_SIZE);
 }

 int main(int argc, char* argv[])
 {
    pos_xy_t pos = 0;
    time_t start_time = time(NULL);
    time_t end_time = time(NULL);
    if(argc != 2)
    {
        printf("Usage: %s <position in decimal>\n", argv[0]);
        return 1;
    }
    pos = (pos_xy_t)strtol(argv[1], NULL, 10);
    RunKnightsTour(pos);
    end_time = time(NULL);
    printf("Time taken: %ld seconds\n", end_time - start_time);
     
     return 0;
 }
 
 