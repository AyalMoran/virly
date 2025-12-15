/*
*************************************************************
*  File        : KnightTest.c
*  Author      : Ayal Moran
*  Reviewer    : Yohai Shohet
*  Date        : 11-12-2025
**************************************************************/
#include "bits_arr.h" /* bits_arr_t  */
#include <assert.h>   /* assert */

#include "Knight.h"

#define SUCCESS (0)
#define FAILURE (1)

#define POSSIBLE_KNIGHT_MOVES (8)
#define TRUE (1)
#define FALSE (0)

typedef pos_xy_t point_t;
/* Knight possible moves offsets */
static const int dcols[POSSIBLE_KNIGHT_MOVES] = {1, 2, 2, 1, -1, -2, -2, -1};
static const int drows[POSSIBLE_KNIGHT_MOVES] = {2, 1, -1, -2, -2, -1, 1, 2};

typedef struct
{
    int row;
    int col;
    point_t pt;
    int degree;
} move_t;

typedef enum heuristic
{
    CLOCKWISE = 0,
    WARNSDORFF = 1
} heuristic_t;

/*
 *---------static
 * declarations-------------------------------------------------*/
static point_t KnightTourCreatePoint(int row, int col);
static unsigned int KnightTourGetRow(point_t point);
static unsigned int KnightTourGetColumn(point_t point);
static knight_status_t RecKnightHelper(pos_xy_t pos, path_t res_path,bits_arr_t board, size_t curr_step, heuristic_t heuristic);
static int MoveIsSafe(int row, int col, bits_arr_t board);
static int CountMoves(int row, int col, bits_arr_t board);
static void PathReset(path_t path, size_t size);
/*
 * ---------------------------
 * API---------------------------------------------*/
knight_status_t KnightSolveBacktracking(pos_xy_t pos, path_t res_path)
{
    bits_arr_t board = 0;
    size_t row = 0;
    size_t col = 0;

    assert(NULL != res_path);
    assert(0 == (pos >> 3 & 1));
    assert(0 == (pos >> 7 & 1));

    PathReset(res_path, BOARD_SIZE);
    row = KnightTourGetRow(pos);
    col = KnightTourGetColumn(pos);
    board = BitsArrSetOn(board, (pos_xy_t) (row * BOARD_DIM + col));
    res_path[0] = pos;

    return RecKnightHelper(pos, res_path, board, 0, CLOCKWISE);
}

knight_status_t KnightSolveHeuristic(pos_xy_t pos, path_t res_path)
{
    bits_arr_t board = 0;
    size_t row = 0;
    size_t col = 0;

    assert(NULL != res_path);
    assert(0 == (pos >> 3 & 1));
    assert(0 == (pos >> 7 & 1));

    PathReset(res_path, BOARD_SIZE);
    row = KnightTourGetRow(pos);
    col = KnightTourGetColumn(pos);
    board = BitsArrSetOn(board, (pos_xy_t) (row * BOARD_DIM + col));
    res_path[0] = pos;

    return RecKnightHelper(pos, res_path, board, 0, WARNSDORFF);
}

static knight_status_t RecKnightHelper(pos_xy_t pos, path_t res_path,
                                       bits_arr_t board, size_t curr_step,
                                       heuristic_t heuristic)
{
    bits_arr_t new_board = 0;
    move_t moves[POSSIBLE_KNIGHT_MOVES] = {{0}};
    move_t temp = {0};
    size_t i = 0;
    size_t move_cnt = 0;
    int next_row = 0;
    int next_col = 0;
    size_t m = 0;
    size_t n = 0;
    int row = KnightTourGetRow(pos);
    int col = KnightTourGetColumn(pos);

    if (curr_step == BOARD_SIZE - 1)
    {
        return SUCCESS;
    }

    for (i = 0; i < POSSIBLE_KNIGHT_MOVES; ++i)
    {
        next_row = row + drows[i];
        next_col = col + dcols[i];

        if (TRUE == MoveIsSafe(next_row, next_col, board))
        {
            moves[move_cnt].row = next_row;
            moves[move_cnt].col = next_col;
            moves[move_cnt].pt = KnightTourCreatePoint(next_row, next_col);
            moves[move_cnt].degree = CountMoves(next_row, next_col, board);
            ++move_cnt;
        }
    }

    if (WARNSDORFF == heuristic && move_cnt > 1)
    {
        m = 0;

        for (m = 1; m < move_cnt; ++m)
        {
            temp = moves[m];
            n = m;

            while (n > 0 && temp.degree < moves[n - 1].degree)
            {
                moves[n] = moves[n - 1];
                --n;
            }

            moves[n] = temp;
        }
    }

    for (i = 0; i < move_cnt; ++i)
    {
        new_board = BitsArrSetOn(
            board, (pos_xy_t) KnightTourGetRow(moves[i].pt) * BOARD_DIM +
                       KnightTourGetColumn(moves[i].pt));
        res_path[curr_step + 1] = moves[i].pt;

        if (KNIGHT_SUCCESS ==
            RecKnightHelper(moves[i].pt, res_path, new_board, curr_step + 1, heuristic))
        {
            return KNIGHT_SUCCESS;
        }
    }

    res_path[curr_step + 1] = 0;
    return KNIGHT_FAILED_TO_FIND;
}

/*
 *---------static definitions-------------------------------------------------*/
static point_t KnightTourCreatePoint(int row, int col)
{
    return (point_t) (row << 4) | col;
}

static unsigned int KnightTourGetRow(point_t point)
{
    return point >> 4;
}

static unsigned int KnightTourGetColumn(point_t point)
{
    return point & 0x07;
}
/* static size_t GetBitFromPoint(point_t point)
{
    unsigned int row = KnightTourGetRow(point);
    unsigned int col = KnightTourGetColumn(point);
    return row * BOARD_DIM + col;

     row = 2
    col = 3
    bit = 2 * 8 + 3 = 19 = 0x13 = 0b 0001 0011

} */

static int MoveIsSafe(int row, int col, bits_arr_t board)
{
    if ((row < 0) || (row >= BOARD_DIM) || (col < 0) || (col >= BOARD_DIM))
    {
        return FALSE;
    }

    return 0 == BitsArrGetBit(board, row * BOARD_DIM + col) ? TRUE : FALSE;
}

static int CountMoves(int row, int col, bits_arr_t board)
{
    size_t i = 0;
    int degree = 0;

    for (i = 0; i < POSSIBLE_KNIGHT_MOVES; ++i)
    {
        int n_row = row + drows[i];
        int n_col = col + dcols[i];

        if (TRUE == MoveIsSafe(n_row, n_col, board))
        {
            ++degree;
        }
    }

    return degree;
}
static void PathReset(path_t path, size_t size)
{
    size_t i = 0;

    assert(NULL != path);

    for (; i < size; ++i)
    {
        path[i] = (pos_xy_t) 0;
    }
}