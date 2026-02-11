#include <stdio.h>
#include <stdlib.h>
#include "ext2.h"

#define FILE_PATH ("ILRD/old-git/other/outsourced_code/false-sharing/surprise.txt")

int main()
{
    ext2_t* fs = Ext2Open("/dev/ram0");
    if (fs == NULL)
    {
        fprintf(stderr, "Failed to open ext2 filesystem\n");
        return EXIT_FAILURE;
    }

    Ext2PrintSuperblock(fs);
    Ext2PrintGroupDescriptor(fs);
    int found = Ext2ReadFile(fs, FILE_PATH);
    if (EXT2_SUCCESS != found)
    {        
        fprintf(stderr, "Failed to read file: %s\n", FILE_PATH);
    }
    
    Ext2Close(fs);
    return found;
}
