#include "ext2.h"
#include <ext2fs/ext2_fs.h>
#include <fcntl.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#define BASE_OFFSET                                                            \
    (0x400) /* beginning of the super block (first group). 0x400 == 1024 */
#define IS_DIR(inode) ((inode).i_mode & 0x4000)

struct Ext2FS
{
    int fd;
    struct ext2_super_block super;
    struct ext2_group_desc group;
    struct ext2_inode rootdir_inode;
    unsigned int block_size;
};

static struct ext2_super_block GetSuperblockInfo(ext2_t* fs)
{
    pread(fs->fd, &fs->super, sizeof(fs->super), BASE_OFFSET);
    fs->block_size = 1024 << fs->super.s_log_block_size;
    return fs->super;
}

static struct ext2_group_desc GetGroupDescriptorInfo(ext2_t* fs)
{
    struct ext2_group_desc group;
    pread(fs->fd, &group, sizeof(group),
          fs->block_size * (fs->super.s_first_data_block + 1));
    return group;
}

static struct ext2_inode GetRootDirInode(ext2_t* fs)
{
    struct ext2_inode rootdir_inode;
    int inode_no = 2; // Root directory is always inode 2
    pread(fs->fd, &rootdir_inode, sizeof(struct ext2_inode),
          fs->block_size * fs->group.bg_inode_table +
              (inode_no - 1) * fs->super.s_inode_size);
    return rootdir_inode;
}

static unsigned int GetBlockSize(ext2_t* fs)
{
    return 1024 << fs->super.s_log_block_size;
}

static int DirEntryMatch(struct ext2_dir_entry_2* entry, const char* name)
{
    return (entry->name_len == strlen(name)) &&
           (strncmp(entry->name, name, entry->name_len) == 0);
}

static struct ext2_dir_entry_2* GetNextEntry(struct ext2_dir_entry_2* entry)
{
    return (struct ext2_dir_entry_2*)((char*)entry + entry->rec_len);
}

static struct ext2_inode get_inode_data(ext2_t* fs, uint32_t inode_num)
{
    struct ext2_inode inode;
    uint32_t index = (inode_num - 1) % fs->super.s_inodes_per_group;
    uint32_t inode_table_block = fs->group.bg_inode_table;
    off_t offset = (off_t)inode_table_block * fs->block_size +
                   (index * fs->super.s_inode_size);

    lseek(fs->fd, offset, SEEK_SET);
    read(fs->fd, &inode, sizeof(struct ext2_inode));
    return inode;
}

static uint32_t find_inode_in_dir(ext2_t* fs, struct ext2_inode* dir_inode,
                                  const char* name)
{
    uint32_t inode_num = 0;
    char* block = (char*)malloc(fs->block_size);
    if (block == NULL)
    {
        perror("Error allocating memory for block");
        return 0;
    }

    // Iterating only through direct blocks
    for (int i = 0; i < 12 && dir_inode->i_block[i]; i++)
    {
        pread(fs->fd, block, fs->block_size,
              (off_t)dir_inode->i_block[i] * fs->block_size);

        struct ext2_dir_entry_2* entry = (struct ext2_dir_entry_2*)block;
        unsigned int size = 0;

        // Traverse the linked list of entries in this block
        while (size < dir_inode->i_size && entry->rec_len > 0)
        {
            // Check if the name matches
            if (DirEntryMatch(entry, name))
            {
                inode_num = entry->inode;
                free(block);
                return inode_num;
            }

            size += entry->rec_len;
            entry = GetNextEntry(entry);
        }
    }
    free(block);
    return 0;
}

static int PrintFileContent(ext2_t* fs, struct ext2_inode* file_inode)
{
    char* buffer = (char*)malloc(fs->block_size);
    if (buffer == NULL)
    {
        perror("Error allocating memory for file content");
        return EXT2_ALLOC_ERROR;
    }

    // For simplicity, we only read direct blocks
    for (int i = 0; i < 12 && file_inode->i_block[i]; ++i)
    {
        pread(fs->fd, buffer, fs->block_size,
              (off_t)file_inode->i_block[i] * fs->block_size);
        fwrite(buffer, 1, fs->block_size, stdout);
    }

    free(buffer);

    return EXT2_SUCCESS;
}

static uint32_t TraversePath(ext2_t* fs, struct ext2_inode* current_inode,
                             char* token)
{
    uint32_t inode_num = 0;
    while (token != NULL)
    {
        if (IS_DIR(*current_inode))
        {
            inode_num = find_inode_in_dir(fs, current_inode, token);
            if (inode_num == 0)
            {
                fprintf(stderr, "File not found: %s\n", token);
                return 0;
            }
            *current_inode = get_inode_data(fs, inode_num);
        }
        else
        {
            fprintf(stderr, "Error: %s is not a directory\n", token);
            return 0;
        }
        token = strtok(NULL, "/");
    }
    return inode_num;
}

ext2_t* Ext2Open(const char* device)
{
    ext2_t* fs = (ext2_t*)malloc(sizeof(ext2_t));
    if (fs == NULL)
    {
        perror("Error allocating memory");
        return NULL;
    }

    int fd = open(device, O_RDONLY);
    if (fd == -1)
    {
        free(fs);
        perror("Error opening file");
        return NULL;
    }

    fs->fd = fd;
    fs->super = GetSuperblockInfo(fs);
    fs->block_size = GetBlockSize(fs);
    fs->group = GetGroupDescriptorInfo(fs);
    fs->rootdir_inode = GetRootDirInode(fs);

    return fs;
}

void Ext2Close(ext2_t* fs)
{
    (void)fs;
    close(fs->fd);
    free(fs);
}

void Ext2PrintSuperblock(ext2_t* fs)
{
    printf("Superblock info:\n");
    printf("  Block size: %u\n", fs->block_size);
    printf("  Inode count: %u\n", fs->super.s_inodes_count);
    printf("  Block count: %u\n", fs->super.s_blocks_count);
}

void Ext2PrintGroupDescriptor(ext2_t* fs)
{
    printf("Group Descriptor info:\n");
    printf("  Block bitmap block: %u\n", fs->group.bg_block_bitmap);
    printf("  Inode bitmap block: %u\n", fs->group.bg_inode_bitmap);
    printf("  Inode table block: %u\n", fs->group.bg_inode_table);
}

int Ext2ReadFile(ext2_t* fs, const char* path)
{
    unsigned int* buffer = NULL;
    uint32_t inode_num = 2;
    char* token = NULL;
    struct ext2_inode current_inode = {
        0,
    };
    char* path_copy = NULL;
    int status = EXT2_SUCCESS;

    path_copy = strdup(path);
    if (path_copy == NULL)
    {
        perror("Error duplicating path string");
        return EXT2_ALLOC_ERROR;
    }

    token = strtok(path_copy, "/");
    current_inode = fs->rootdir_inode;

    inode_num = TraversePath(fs, &current_inode, token);
    if (inode_num == 0)
    {
        fprintf(stderr, "Error: %s not found\n", token);

        status = EXT2_FILE_NOT_FOUND;
    }
    else if (IS_DIR(current_inode))
    {
        fprintf(stderr, "Error: %s is a directory\n", token);

        status = EXT2_IS_DIR;
    }
    else
    {
        printf("File found with inode number: %u\n", inode_num);
        PrintFileContent(fs, &current_inode);
    }

    free(buffer);
    free(path_copy);
    return status;
}
