#include <algorithm>
#include <cstdint>
#include <string>
#include <thread>
#include <vector>

#include "test_utils.hpp"
#include "identity/UUID.hpp"

namespace
{

void TestSerializationRoundTrip()
{
    INIT_SUITE(suite, "UUID Serialization");
    BEGIN_SUITE(suite);

    ilrd::UUID original;
    ilrd::Buffer buffer;
    buffer << original;

    ilrd::UUID roundTrip;
    buffer >> roundTrip;

    ASSERT_TRUE(suite, roundTrip == original);
    ASSERT_EQ(suite, ilrd::UUID::SERIALIZED_SIZE, buffer.GetSize());

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestExplicitValueRoundTrip()
{
    INIT_SUITE(suite, "UUID Wire Width");
    BEGIN_SUITE(suite);

    ilrd::UUID original(0x0102030405060708ULL,
                        0x1112131415161718LL,
                        0xAABBCCDDu,
                        0x0A141E28u);
    ilrd::Buffer buffer;
    buffer << original;

    ilrd::UUID roundTrip(0, 0, 0, 0);
    buffer >> roundTrip;

    ASSERT_TRUE(suite, roundTrip == original);
    ASSERT_EQ(suite, static_cast<std::size_t>(24), buffer.GetSize());

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestThreadSafety()
{
    INIT_SUITE(suite, "UUID Thread Safety");
    BEGIN_SUITE(suite);

    const std::size_t threadCount = 8;
    const std::size_t uuidsPerThread = 5000;
    std::vector<std::thread> threads;
    std::vector<std::vector<std::string> > perThreadResults(threadCount);

    threads.reserve(threadCount);

    for (std::size_t threadIndex = 0; threadIndex < threadCount; ++threadIndex)
    {
        threads.push_back(std::thread([&, threadIndex]() {
            std::vector<std::string>& local = perThreadResults[threadIndex];
            local.reserve(uuidsPerThread);

            for (std::size_t i = 0; i < uuidsPerThread; ++i)
            {
                ilrd::UUID uuid;
                local.push_back(uuid.ToString());
            }
        }));
    }

    for (std::size_t i = 0; i < threads.size(); ++i)
    {
        threads[i].join();
    }

    std::vector<std::string> allUUIDs;
    allUUIDs.reserve(threadCount * uuidsPerThread);

    for (std::size_t i = 0; i < perThreadResults.size(); ++i)
    {
        allUUIDs.insert(allUUIDs.end(),
                        perThreadResults[i].begin(),
                        perThreadResults[i].end());
    }

    std::sort(allUUIDs.begin(), allUUIDs.end());

    ASSERT_EQ(suite, threadCount * uuidsPerThread, allUUIDs.size());
    ASSERT_TRUE(suite,
                std::adjacent_find(allUUIDs.begin(), allUUIDs.end()) ==
                    allUUIDs.end());

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

} // namespace

int main()
{
    PRINT_TEST_HEADER("UUID");

    TestSerializationRoundTrip();
    TestExplicitValueRoundTrip();
    TestThreadSafety();

    PRINT_SUMMARY();

    return 0;
}
