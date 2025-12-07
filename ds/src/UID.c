/******************
 Author  : Ayal Moran
 Reviewer: Or Oved
 Date    : 22.4.25
 *****************/
#include <arpa/inet.h>/* struct in_addr */
#include <assert.h>/* assert */
#include <ifaddrs.h>/* getifaddrs */
#include <pthread.h>/* pthread_mutex_t */
#include <string.h>/* memset */
#include <sys/socket.h>/* sockaddr */
#include <time.h>/* time_t */
#include <unistd.h>/* getpid */

#include "UID.h"

#define LOCAL_PREFIX (127)
#define SIZE_OF_IP (4)
#define FAIL (1)
#define SUCCESS (0)
#define SIZE_MAX ((size_t) (-1))

static int UIDSetIPAddress(unsigned char* ip);
static int UIDSetCounter(ilrd_uid_t* uid);

const  ilrd_uid_t UIDBadUID          = {0, (time_t) (-1), (pid_t) (-1), {0}};
static pthread_mutex_t counter_mutex = PTHREAD_MUTEX_INITIALIZER;

ilrd_uid_t UIDCreate(void)
{
    ilrd_uid_t uid = {0, (time_t) (-1), (pid_t) (-1), {0}};

    uid.pid = getpid();
    
    uid.time = time(NULL);
    if ((time_t) -1 == uid.time)
    {
        return UIDBadUID;
    }

    if (FAIL == UIDSetIPAddress(uid.ip))
    {
        return UIDBadUID;
    }

    if (FAIL == UIDSetCounter(&uid))
    {
        return UIDBadUID;
    }

    return uid;
}

int UIDIsSame(ilrd_uid_t uid1, ilrd_uid_t uid2)
{
    return uid1.counter == uid2.counter && uid1.pid == uid2.pid &&
           uid1.time    == uid2.time && !memcmp(uid1.ip, uid2.ip, SIZE_OF_IP);
}

static int UIDSetIPAddress(unsigned char* ip)
{
    struct ifaddrs* list          = NULL;
    struct ifaddrs* it            = NULL;
    const  struct sockaddr_in* sa = NULL;

    assert(ip);

    if (-1 == getifaddrs(&list))
    {
        return FAIL;
    }

    for (it = list; it; it = it->ifa_next)
    {
        if (it->ifa_addr && AF_INET == it->ifa_addr->sa_family)
        {
            sa = (const struct sockaddr_in*) it->ifa_addr;

            if ((ntohl(sa->sin_addr.s_addr) >> 24) == LOCAL_PREFIX)
            {
                continue;
            }

            memcpy(ip, &sa->sin_addr.s_addr, SIZE_OF_IP);

            freeifaddrs(list);

            return SUCCESS;
        }
    }

    freeifaddrs(list);

    return FAIL;
}

static int UIDSetCounter(ilrd_uid_t* uid)
{
    static size_t counter = 0;
    int    status         = SUCCESS;

    assert(uid);

    if (0 != pthread_mutex_lock(&counter_mutex))
    {
        return FAIL;
    }

    if (SIZE_MAX == counter)
    {
        counter = 0;
    }
    else
    {
        uid->counter = counter++;
    }

    if (0 != pthread_mutex_unlock(&counter_mutex))
    {
        return FAIL;
    }

    return status;
}