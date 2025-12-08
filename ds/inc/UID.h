/******************
 Author : Ayal Moran
 Reviewer: Or Oved
 Date: 22.4.25
 *****************/
#ifndef _ILRD_UID_H
#define _ILRD_UID_H

#include <stddef.h>   /* size_t  */
#include <time.h>     /* time_t  */
#include <sys/types.h>/* pid_t   */

typedef struct{
	size_t counter;
	time_t time;
	pid_t pid;
	unsigned char ip[4];
}ilrd_uid_t;

/**
 * @brief A value representing an invalid UID.
 *
 * @details All zero UID is returned on failure by UIDCreate and can be
 *          used as a quick validity check.
 */
extern const ilrd_uid_t UIDBadUID;

/**
 * @brief Generates a new unique identifier (UID).
 *
 * @details Combines a static counter, current time, creator PID, and host IP.
 *
 * @return A fully‑initialized ilrd_uid_t.  
 *         On failure (no non‑loopback interface) returns UIDBadUID.
 *
 * @complexity Time: O(1)  
 *             Space: O(1)
 */
ilrd_uid_t UIDCreate(void);

/**
 * @brief Tests equality between two UIDs.
 *
 * @param uid1 First UID to compare.  
 * @param uid2 Second UID to compare.
 *
 * @return Non‑zero if the UIDs are identical, else zero .
 *
 * @complexity Time: O(1)  
 *             Space: O(1)
 */
int UIDIsSame(ilrd_uid_t uid1, ilrd_uid_t uid2);

#endif /* _ILRD_UID_H */
