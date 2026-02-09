#ifndef __FSPARSE_H__
#define __FSPARSE_H__

typedef enum ext2status
{
    EXT2_SUCCESS = 0,
    EXT2_FILE_NOT_FOUND = 1,
    EXT2_IS_DIR = 2,
    EXT2_ALLOC_ERROR = 3
}ext2status_t;

typedef struct Ext2FS ext2_t;

/*
* @brief Opens the ext2 filesystem on the specified device and reads the superblock, * group descriptor, and root directory inode information.
* @param device The path to the device containing the ext2 filesystem.
*
* @return A pointer to an ext2_t structure containing the filesystem information. 
*/
ext2_t* Ext2Open(const char* device);

/*
* @brief Closes the ext2 filesystem and frees associated resources.
* @param fs The ext2_t structure representing the filesystem to close.
*
* @return void
*/
void Ext2Close(ext2_t* fs);

/*
* @brief Prints information about the ext2 superblock.
* @param fs The ext2_t structure representing the filesystem.
*
* @return void
*/
void Ext2PrintSuperblock(ext2_t* fs);

/*
* @brief Prints information about the ext2 group descriptor.
* @param fs The ext2_t structure representing the filesystem.
*
* @return void
*/
void Ext2PrintGroupDescriptor(ext2_t* fs);

/*
* @brief Reads the content of a file specified by its path in the ext2 filesystem and prints it to the standard output.
*
* @param fs The ext2_t structure representing the filesystem.
* @param path The path to the file to read.
* @return An ext2status_t value indicating the result of the operation (e.g., success, file not found, is a directory, allocation error).
*/
int  Ext2ReadFile(ext2_t* fs, const char* path);

#endif /* __FSPARSE_H__ */
