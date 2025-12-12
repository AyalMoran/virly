#ifndef __KNIGHT_H__
#define __KNIGHT_H__

#include <stddef.h>

#define BOARD_DIM 8
#define BOARD_SIZE ((BOARD_DIM) * (BOARD_DIM))
#define MAX_MOVES 8

typedef enum KnightStatus
{
    KNIGHT_SUCCESS        = 0,
    KNIGHT_FAILED_TO_FIND = 1,
    KNIGHT_TIMEOUT        = 2
}knight_status_t;


/* pos = MSB |0|Y|Y|Y|0|X|X|X| LSB*/

typedef unsigned char pos_xy_t;
typedef pos_xy_t path_t[BOARD_SIZE]; 

knight_status_t KnightSolveBacktracking(pos_xy_t pos, path_t res_path);

knight_status_t KnightSolveHeuristic(pos_xy_t pos, path_t res_path);

#endif /* __KNIGHT_H__ */
