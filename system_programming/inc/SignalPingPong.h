/**************************************************************
 * File    : SignalPingPong.h
 * Author  : Ayal Moran
 * Reviewer: Oshri F.
 * Date    : 18-12-25
**************************************************************/
#ifndef _SIGNALPINGPONG_H
#define _SIGNALPINGPONG_H

/*
* @brief : Runs a ping-pong signal exchange between two processes for a specified number of rounds.
* @param num_rounds : The number of ping-pong rounds to execute.
* @return : EXIT_SUCCESS on success, EXIT_FAILURE on failure.
*/
int SignalPingPong(size_t num_rounds);

#endif  /* _SIGNALPINGPONG_H */
