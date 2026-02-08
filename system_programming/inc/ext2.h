#ifndef __FSPARSE_H__
#define __FSPARSE_H__

typedef struct Ext2FS ext2_t;

ext2_t* Ext2Open(const char* device);
void Ext2Close(ext2_t* fs);

void Ext2PrintSuperblock(ext2_t* fs);
void Ext2PrintGroupDescriptor(ext2_t* fs);

int  Ext2ReadFile(ext2_t* fs, const char* path);

#endif /* __FSPARSE_H__ */
