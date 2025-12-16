/*
*************************************************************
*  File        : KnightTest.c
*  Author      : Ayal Moran
*  Reviewer    : Yohai Shohet
*  Date        : 11-12-2025
**************************************************************/
#ifndef __KNIGHT_H__
#define __KNIGHT_H__

#include <stddef.h> /*size_t*/

#define BOARD_DIM 8
#define BOARD_SIZE ((BOARD_DIM) * (BOARD_DIM))
#define MAX_MOVES 8

typedef enum KnightStatus
{
    KNIGHT_SUCCESS        = 0,
    KNIGHT_FAILED_TO_FIND = 1,
    KNIGHT_TIMEOUT        = 2
}knight_status_t;


/* */

typedef unsigned char pos_xy_t;
typedef pos_xy_t path_t[BOARD_SIZE]; 


/*
 *
 * @brief Solves the Knight's Tour problem using backtracking algorithm.
 *   @param pos - The starting position of the knight on the chessboard.
 *                pos is represented as a single byte where the lower nibble
 *                represent the column (0-7) and the higher nibble represent the row (0-7).
 *                For example, position 0b00010010 (i.e 0x17) represents row 1, column 2.
 *                The 8th and the 4th bit must be 0.
 * 
 *                
 *   @param res_path - An array to store the resulting path of the knight's tour.
 *                     The array should be of size BOARD_SIZE (64).
 * 
 * @note
 *   Time: O(n!)
 *
 *   Space: O(n)
 *
 * @return
 *   knight_status_t - KNIGHT_SUCCESS on success, KNIGHT_FAILED_TO_FIND if no
 * solution is found.
 */
knight_status_t KnightSolveBacktracking(pos_xy_t pos, path_t res_path);

/*
 *
 * @brief Solves the Knight's Tour problem using Warnsdorff's heuristic algorithm.
 *   @param pos - The starting position of the knight on the chessboard.
 *                pos is represented as a single byte where the lower nibble
 *                represent the column (0-7) and the higher nibble represent the row (0-7).
 *                For example, position 0b00010010 (i.e 0x17) represents row 1, column 2.
 *                The 8th and the 4th bit must be 0.
 * 
 *   @param res_path - An array to store the resulting path of the knight's tour.
 *                     The array should be of size BOARD_SIZE (64).
 * 
 * @note
 *   Time: O(n!)
 *
 *   Space: O(n)
 *
 * @return
 *   knight_status_t - KNIGHT_SUCCESS on success, KNIGHT_FAILED_TO_FIND if no
 * solution is found.
 */
knight_status_t KnightSolveHeuristic(pos_xy_t pos, path_t res_path);

#endif /* __KNIGHT_H__ */
