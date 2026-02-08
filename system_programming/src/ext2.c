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
        perror("Error opening file");
        return NULL;
    }

    struct ext2_super_block super;
    pread(fd, &super, sizeof(super), BASE_OFFSET);

    unsigned int block_size = 1024 << super.s_log_block_size;

    struct ext2_group_desc group;
    pread(fd, &group, sizeof(group),
          block_size * (super.s_first_data_block + 1));
    struct ext2_inode rootdir_inode;
    int inode_no = 2;
    pread(fd, &rootdir_inode, sizeof(struct ext2_inode),
          block_size * group.bg_inode_table +
              (inode_no - 1) * super.s_inode_size);

    fs->fd = fd;
    fs->super = super;
    fs->group = group;
    fs->block_size = block_size;
    fs->rootdir_inode = rootdir_inode;

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

struct ext2_inode get_inode_data(int fd, uint32_t inode_num,
                                 struct ext2_super_block* sb,
                                 struct ext2_group_desc* bgds)
{
    uint32_t group = (inode_num - 1) / sb->s_inodes_per_group;
    uint32_t index = (inode_num - 1) % sb->s_inodes_per_group;
    uint32_t inode_table_block = bgds[group].bg_inode_table;

    struct ext2_inode inode;
    uint32_t block_size = 1024 << sb->s_log_block_size;
    off_t offset =
        (off_t)inode_table_block * block_size + (index * sb->s_inode_size);

    lseek(fd, offset, SEEK_SET);
    read(fd, &inode, sizeof(struct ext2_inode));
    return inode;
}

uint32_t find_inode_in_dir(ext2_t* fs, struct ext2_inode* dir_inode,
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
        pread(fs->fd, block, fs->block_size, (off_t)dir_inode->i_block[i] * fs->block_size);

        struct ext2_dir_entry_2* entry = (struct ext2_dir_entry_2*)block;
        unsigned int size = 0;

        // Traverse the linked list of entries in this block
        while (size < dir_inode->i_size && entry->rec_len > 0)
        {
            // Check if the name matches
            if (strncmp(name, entry->name, entry->name_len) == 0 &&
                strlen(name) == entry->name_len)
            {
                inode_num = entry->inode; // Found it!
                free(block);
                return inode_num;
            }
            // Move to the next entry using rec_len (record length)
            size += entry->rec_len;
            entry = (struct ext2_dir_entry_2*)((char*)entry + entry->rec_len);
        }
    }
    free(block);
    return 0;

static void PrintFileContent(ext2_t* fs, struct ext2_inode* file_inode)
{
    char* buffer = (char*)malloc(fs->block_size);
    if (buffer == NULL)
    {
        perror("Error allocating memory for file content");
        return;
    }

    // For simplicity, we only read direct blocks
    for (int i = 0; i < 12 && file_inode->i_block[i]; i++)
    {
        pread(fs->fd, buffer, fs->block_size,
              (off_t)file_inode->i_block[i] * fs->block_size);
        fwrite(buffer, 1, fs->block_size, stdout);
    }
    free(buffer);
}


int Ext2ReadFile(ext2_t* fs, const char* path)
{
    (void)fs;
    unsigned int* buffer = NULL;
    buffer = (unsigned int*)malloc(sizeof(unsigned int) * 14);
    char* path_copy = (char*)malloc(strlen(path) + 1);
    if (path_copy == NULL)
    {
        perror("Error allocating memory for path");
        free(buffer);
        return -1;
    }
    strcpy(path_copy, path);
    char* token = strtok(path_copy, "/");
    struct ext2_inode current_inode = fs->rootdir_inode;
    uint32_t inode_num = 2;

    while (token != NULL)
    {
        if (IS_DIR(current_inode))
        {
            inode_num = find_inode_in_dir(fs, &current_inode, token);
            if (inode_num == 0)
            {
                fprintf(stderr, "File not found: %s\n", token);
                free(buffer);
                free(path_copy);
                return -1;
            }
        }
        else
        {
            fprintf(stderr, "Error: %s is not a directory\n", token);
            free(buffer);
            free(path_copy);
            return -1;
        }
        current_inode =
            get_inode_data(fs->fd, inode_num, &fs->super, &fs->group);
            token = strtok(NULL, "/");

    }

    printf("File found with inode number: %u\n", inode_num);
    PrintFileContent(fs, &current_inode);
    free(buffer);
    free(path_copy);
    return 0;
}
