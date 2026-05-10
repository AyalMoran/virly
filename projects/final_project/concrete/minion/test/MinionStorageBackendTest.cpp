#include <cstdint>
#include <cstdio>
#include <filesystem>
#include <stdexcept>
#include <string>
#include <vector>

#include <unistd.h>

#include "storage/MinionStorageBackend.hpp"
#include "test_utils.hpp"

namespace
{

class TempBackingFile
{
  public:
    explicit TempBackingFile(const std::string& stem)
        : m_path(std::filesystem::temp_directory_path() /
                 (stem + "_" + std::to_string(::getpid()) + ".bin"))
    {
        std::filesystem::remove(m_path);
    }

    ~TempBackingFile()
    {
        std::error_code error;
        std::filesystem::remove(m_path, error);
    }

    const std::string PathName() const
    {
        return m_path.string();
    }

  private:
    std::filesystem::path m_path;
};

void TestCreateAndSizeBackingFile()
{
    INIT_SUITE(suite, "Create And Size Backing File");
    BEGIN_SUITE(suite);

    TempBackingFile temp("minion_storage_create");
    {
        ilrd::concrete::MinionStorageBackend storage(temp.PathName(), 4096);
        ASSERT_EQ(suite, 4096ULL, storage.GetCapacity());
    }

    ASSERT_EQ(suite, 4096ULL, std::filesystem::file_size(temp.PathName()));

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestReopenExistingSizedFile()
{
    INIT_SUITE(suite, "Reopen Existing Sized File");
    BEGIN_SUITE(suite);

    TempBackingFile temp("minion_storage_reopen");
    {
        ilrd::concrete::MinionStorageBackend storage(temp.PathName(), 2048);
    }

    bool threw = false;
    try
    {
        ilrd::concrete::MinionStorageBackend storage(temp.PathName(), 2048);
        ASSERT_EQ(suite, 2048ULL, storage.GetCapacity());
    }
    catch (...)
    {
        threw = true;
    }

    ASSERT_FALSE(suite, threw);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestRejectExistingSizeMismatch()
{
    INIT_SUITE(suite, "Reject Existing Size Mismatch");
    BEGIN_SUITE(suite);

    TempBackingFile temp("minion_storage_mismatch");
    {
        ilrd::concrete::MinionStorageBackend storage(temp.PathName(), 1024);
    }

    bool threw = false;
    try
    {
        ilrd::concrete::MinionStorageBackend storage(temp.PathName(), 2048);
    }
    catch (const std::invalid_argument&)
    {
        threw = true;
    }

    ASSERT_TRUE(suite, threw);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestWriteReadRoundTrip()
{
    INIT_SUITE(suite, "Write Read Round Trip");
    BEGIN_SUITE(suite);

    TempBackingFile temp("minion_storage_roundtrip");
    ilrd::concrete::MinionStorageBackend storage(temp.PathName(), 4096);
    const std::vector<std::uint8_t> payload = {0x10, 0x20, 0x30, 0x40};

    storage.Write(128, payload);
    const std::vector<std::uint8_t> read_back = storage.Read(128, payload.size());

    ASSERT_EQ(suite, payload.size(), read_back.size());
    ASSERT_EQ(suite, 0x10, read_back[0]);
    ASSERT_EQ(suite, 0x40, read_back[3]);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestFlushSucceeds()
{
    INIT_SUITE(suite, "Flush Succeeds");
    BEGIN_SUITE(suite);

    TempBackingFile temp("minion_storage_flush");
    ilrd::concrete::MinionStorageBackend storage(temp.PathName(), 4096);
    const std::vector<std::uint8_t> payload = {0xAA, 0xBB};

    bool threw = false;
    try
    {
        storage.Write(0, payload);
        storage.Flush();
    }
    catch (...)
    {
        threw = true;
    }

    ASSERT_FALSE(suite, threw);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestRejectReadPastCapacity()
{
    INIT_SUITE(suite, "Reject Read Past Capacity");
    BEGIN_SUITE(suite);

    TempBackingFile temp("minion_storage_read_oob");
    ilrd::concrete::MinionStorageBackend storage(temp.PathName(), 256);

    bool threw = false;
    try
    {
        storage.Read(200, 80);
    }
    catch (const std::out_of_range&)
    {
        threw = true;
    }

    ASSERT_TRUE(suite, threw);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestRejectWritePastCapacity()
{
    INIT_SUITE(suite, "Reject Write Past Capacity");
    BEGIN_SUITE(suite);

    TempBackingFile temp("minion_storage_write_oob");
    ilrd::concrete::MinionStorageBackend storage(temp.PathName(), 256);

    bool threw = false;
    try
    {
        storage.Write(240, std::vector<std::uint8_t>(32, 0xCC));
    }
    catch (const std::out_of_range&)
    {
        threw = true;
    }

    ASSERT_TRUE(suite, threw);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

} // namespace

int main()
{
    PRINT_TEST_HEADER("Minion Storage Backend");

    TestCreateAndSizeBackingFile();
    TestReopenExistingSizedFile();
    TestRejectExistingSizeMismatch();
    TestWriteReadRoundTrip();
    TestFlushSucceeds();
    TestRejectReadPastCapacity();
    TestRejectWritePastCapacity();

    PRINT_SUMMARY();
    return 0;
}
