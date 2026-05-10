#include <stdexcept>

#include "metadata/MasterMetadata.hpp"
#include "placement/RAIDManager.hpp"
#include "transport/IMinionProxy.hpp"
#include "test_utils.hpp"

namespace
{

using ilrd::UUID;
using ilrd::concrete::IMinionProxy;
using ilrd::concrete::MasterMetadata;
using ilrd::concrete::RAIDManager;
using ilrd::wire::HealthState;
using ilrd::wire::MessageV1;

class MockMinionProxy : public IMinionProxy
{
  public:
    UUID SendReadRequest(std::uint64_t offset,
                         std::uint32_t length,
                         const UUID& request_id) override
    {
        (void)offset;
        (void)length;
        return request_id;
    }

    UUID SendWriteRequest(std::uint64_t offset,
                          const std::vector<std::uint8_t>& payload,
                          const UUID& request_id) override
    {
        (void)offset;
        (void)payload;
        return request_id;
    }

    UUID SendFlushRequest(const UUID& request_id) override
    {
        return request_id;
    }

    UUID SendHeartbeatRequest(const UUID& node_id,
                              std::uint64_t heartbeat_seq,
                              HealthState health_state,
                              const UUID& request_id) override
    {
        (void)node_id;
        (void)heartbeat_seq;
        (void)health_state;
        return request_id;
    }

    bool ReceiveResponse(MessageV1& out,
                         std::chrono::milliseconds timeout) override
    {
        (void)out;
        (void)timeout;
        return false;
    }
};

void TestRegisterPrimaryNode()
{
    INIT_SUITE(suite, "MasterMetadata Register Primary Node");
    BEGIN_SUITE(suite);

    MockMinionProxy proxy;
    MasterMetadata metadata;
    const UUID node_id(1, 2, 3, 4);
    metadata.RegisterNode(node_id, proxy, 4096, HealthState::HEALTHY);

    ASSERT_EQ(suite, 1u, metadata.NodeCount());
    ASSERT_TRUE(suite, metadata.ContainsNode(node_id));
    ASSERT_TRUE(suite, metadata.GetPrimaryNodeId() == node_id);
    ASSERT_EQ(suite, 4096ULL, metadata.GetPrimaryCapacity());
    ASSERT_TRUE(suite, metadata.GetNodeIdAt(0) == node_id);
    ASSERT_TRUE(suite, metadata.GetNodeAt(0).node_id == node_id);
    ASSERT_EQ(suite, 4096ULL, metadata.GetMinimumCapacity());
    ASSERT_EQ(suite, 4096ULL, metadata.GetExposedCapacity());
    ASSERT_EQ(suite, static_cast<int>(HealthState::HEALTHY),
              static_cast<int>(metadata.GetPrimaryHealth()));
    ASSERT_TRUE(suite, &metadata.GetPrimaryProxy() == &proxy);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestUpdateNodeHealthAndActive()
{
    INIT_SUITE(suite, "MasterMetadata Update Node State");
    BEGIN_SUITE(suite);

    MockMinionProxy proxy;
    MasterMetadata metadata;
    const UUID node_id(2, 3, 4, 5);
    metadata.RegisterNode(node_id, proxy, 1024);
    metadata.SetNodeHealth(node_id, HealthState::DEGRADED);
    metadata.SetNodeActive(node_id, false);

    ASSERT_EQ(suite, static_cast<int>(HealthState::DEGRADED),
              static_cast<int>(metadata.GetNode(node_id).health_state));
    ASSERT_FALSE(suite, metadata.GetNode(node_id).active);

    bool threw = false;
    try
    {
        metadata.GetPrimaryProxy();
    }
    catch (const std::logic_error&)
    {
        threw = true;
    }
    ASSERT_TRUE(suite, threw);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestOutOfSyncTracking()
{
    INIT_SUITE(suite, "MasterMetadata Out Of Sync Tracking");
    BEGIN_SUITE(suite);

    MockMinionProxy proxy;
    MasterMetadata metadata;
    const UUID node_id(8, 9, 10, 11);
    metadata.RegisterNode(node_id, proxy, 1024);

    ASSERT_FALSE(suite, metadata.IsNodeOutOfSync(node_id));
    metadata.MarkNodeOutOfSync(node_id);
    ASSERT_TRUE(suite, metadata.IsNodeOutOfSync(node_id));
    ASSERT_TRUE(suite, metadata.GetNode(node_id).out_of_sync);
    metadata.ClearNodeOutOfSync(node_id);
    ASSERT_FALSE(suite, metadata.IsNodeOutOfSync(node_id));

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestRejectInvalidMetadata()
{
    INIT_SUITE(suite, "MasterMetadata Reject Invalid Data");
    BEGIN_SUITE(suite);

    MockMinionProxy proxy;
    MasterMetadata metadata;
    bool threw_zero_capacity = false;
    try
    {
        metadata.RegisterNode(UUID(3, 4, 5, 6), proxy, 0);
    }
    catch (const std::invalid_argument&)
    {
        threw_zero_capacity = true;
    }

    bool threw_unknown = false;
    try
    {
        metadata.GetNode(UUID(9, 9, 9, 9));
    }
    catch (const std::out_of_range&)
    {
        threw_unknown = true;
    }

    ASSERT_TRUE(suite, threw_zero_capacity);
    ASSERT_TRUE(suite, threw_unknown);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestRAIDManagerUsesMetadataCapacity()
{
    INIT_SUITE(suite, "RAIDManager Uses Metadata Capacity");
    BEGIN_SUITE(suite);

    MockMinionProxy proxy;
    MasterMetadata metadata;
    metadata.RegisterNode(UUID(4, 5, 6, 7), proxy, 128);
    RAIDManager raid_manager(metadata, RAIDManager::Config{64});

    ASSERT_TRUE(suite, &raid_manager.ResolveReadTarget(64, 32) == &proxy);
    ASSERT_TRUE(suite, &raid_manager.ResolveWriteTarget(0, 128) == &proxy);

    bool read_threw = false;
    try
    {
        raid_manager.ResolveReadTarget(120, 16);
    }
    catch (const std::out_of_range&)
    {
        read_threw = true;
    }

    bool write_threw = false;
    try
    {
        raid_manager.ResolveWriteTarget(129, 1);
    }
    catch (const std::out_of_range&)
    {
        write_threw = true;
    }

    ASSERT_TRUE(suite, read_threw);
    ASSERT_TRUE(suite, write_threw);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestRAIDManagerPrimaryAndMirrorPlacement()
{
    INIT_SUITE(suite, "RAIDManager Primary And Mirror Placement");
    BEGIN_SUITE(suite);

    MockMinionProxy proxies[4];
    MasterMetadata metadata;
    const UUID m0(10, 0, 0, 0);
    const UUID m1(11, 0, 0, 0);
    const UUID m2(12, 0, 0, 0);
    const UUID m3(13, 0, 0, 0);
    metadata.RegisterNode(m0, proxies[0], 16384);
    metadata.RegisterNode(m1, proxies[1], 16384);
    metadata.RegisterNode(m2, proxies[2], 16384);
    metadata.RegisterNode(m3, proxies[3], 16384);
    RAIDManager raid_manager(metadata, RAIDManager::Config{4096});

    const std::vector<RAIDManager::PlacementSegment> placements =
        raid_manager.ResolveWritePlacements(0, 4096 * 4);

    ASSERT_EQ(suite, 4u, placements.size());
    ASSERT_TRUE(suite, placements[0].primary.node_id == m0);
    ASSERT_TRUE(suite, placements[0].mirror.has_value());
    ASSERT_TRUE(suite, placements[0].mirror->node_id == m1);
    ASSERT_EQ(suite, 8192ULL, placements[0].mirror->local_offset);
    ASSERT_TRUE(suite, placements[1].primary.node_id == m1);
    ASSERT_TRUE(suite, placements[1].mirror->node_id == m2);
    ASSERT_EQ(suite, 8192ULL, placements[1].mirror->local_offset);
    ASSERT_TRUE(suite, placements[2].primary.node_id == m2);
    ASSERT_TRUE(suite, placements[2].mirror->node_id == m3);
    ASSERT_EQ(suite, 8192ULL, placements[2].mirror->local_offset);
    ASSERT_TRUE(suite, placements[3].primary.node_id == m3);
    ASSERT_TRUE(suite, placements[3].mirror->node_id == m0);
    ASSERT_EQ(suite, 8192ULL, placements[3].mirror->local_offset);
    ASSERT_TRUE(suite, placements[0].primary.proxy == &proxies[0]);
    ASSERT_TRUE(suite, placements[0].mirror->proxy == &proxies[1]);
    ASSERT_EQ(suite, static_cast<int>(RAIDManager::TargetRole::PRIMARY),
              static_cast<int>(placements[0].primary.role));
    ASSERT_EQ(suite, static_cast<int>(RAIDManager::TargetRole::MIRROR),
              static_cast<int>(placements[0].mirror->role));

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestRAIDManagerSupportsOddNodeNextMirror()
{
    INIT_SUITE(suite, "RAIDManager Odd Node Next Mirror");
    BEGIN_SUITE(suite);

    MockMinionProxy proxies[3];
    MasterMetadata metadata;
    const UUID m0(20, 0, 0, 0);
    const UUID m1(21, 0, 0, 0);
    const UUID m2(22, 0, 0, 0);
    metadata.RegisterNode(m0, proxies[0], 4096);
    metadata.RegisterNode(m1, proxies[1], 4096);
    metadata.RegisterNode(m2, proxies[2], 4096);
    RAIDManager raid_manager(metadata, RAIDManager::Config{1024});

    const std::vector<RAIDManager::PlacementSegment> placements =
        raid_manager.ResolveReadPlacements(0, 1024 * 3);

    ASSERT_EQ(suite, 3u, placements.size());
    ASSERT_TRUE(suite, placements[0].primary.node_id == m0);
    ASSERT_TRUE(suite, placements[0].mirror->node_id == m1);
    ASSERT_TRUE(suite, placements[1].primary.node_id == m1);
    ASSERT_TRUE(suite, placements[1].mirror->node_id == m2);
    ASSERT_TRUE(suite, placements[2].primary.node_id == m2);
    ASSERT_TRUE(suite, placements[2].mirror->node_id == m0);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestRAIDManagerLocalOffsetsAndSplitting()
{
    INIT_SUITE(suite, "RAIDManager Local Offsets And Splitting");
    BEGIN_SUITE(suite);

    MockMinionProxy proxies[2];
    MasterMetadata metadata;
    const UUID m0(30, 0, 0, 0);
    const UUID m1(31, 0, 0, 0);
    metadata.RegisterNode(m0, proxies[0], 8192);
    metadata.RegisterNode(m1, proxies[1], 8192);
    RAIDManager raid_manager(metadata, RAIDManager::Config{1024});

    const std::vector<RAIDManager::PlacementSegment> placements =
        raid_manager.ResolveWritePlacements(768, 1024);

    ASSERT_EQ(suite, 2u, placements.size());
    ASSERT_EQ(suite, 768ULL, placements[0].logical_offset);
    ASSERT_EQ(suite, 256u, placements[0].length);
    ASSERT_TRUE(suite, placements[0].primary.node_id == m0);
    ASSERT_EQ(suite, 768ULL, placements[0].primary.local_offset);
    ASSERT_TRUE(suite, placements[0].mirror->node_id == m1);
    ASSERT_EQ(suite, 4864ULL, placements[0].mirror->local_offset);

    ASSERT_EQ(suite, 1024ULL, placements[1].logical_offset);
    ASSERT_EQ(suite, 768u, placements[1].length);
    ASSERT_TRUE(suite, placements[1].primary.node_id == m1);
    ASSERT_EQ(suite, 0ULL, placements[1].primary.local_offset);
    ASSERT_TRUE(suite, placements[1].mirror->node_id == m0);
    ASSERT_EQ(suite, 4096ULL, placements[1].mirror->local_offset);

    const std::vector<RAIDManager::PlacementSegment> second_cycle =
        raid_manager.ResolveReadPlacements(2048, 512);
    ASSERT_EQ(suite, 1u, second_cycle.size());
    ASSERT_TRUE(suite, second_cycle[0].primary.node_id == m0);
    ASSERT_EQ(suite, 1024ULL, second_cycle[0].primary.local_offset);
    ASSERT_TRUE(suite, second_cycle[0].mirror->node_id == m1);
    ASSERT_EQ(suite, 5120ULL, second_cycle[0].mirror->local_offset);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestRAIDManagerSingleMinionFallback()
{
    INIT_SUITE(suite, "RAIDManager Single Minion Fallback");
    BEGIN_SUITE(suite);

    MockMinionProxy proxy;
    MasterMetadata metadata;
    const UUID node_id(40, 0, 0, 0);
    metadata.RegisterNode(node_id, proxy, 4096);
    RAIDManager raid_manager(metadata, RAIDManager::Config{1024});

    const std::vector<RAIDManager::PlacementSegment> placements =
        raid_manager.ResolveWritePlacements(1024, 512);

    ASSERT_EQ(suite, 1u, placements.size());
    ASSERT_TRUE(suite, placements[0].primary.node_id == node_id);
    ASSERT_FALSE(suite, placements[0].mirror.has_value());
    ASSERT_TRUE(suite, &raid_manager.ResolveWriteTarget(1024, 512) == &proxy);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestRAIDManagerKeepsInactiveTargetsForDegradedPolicy()
{
    INIT_SUITE(suite, "RAIDManager Inactive Targets For Degraded Policy");
    BEGIN_SUITE(suite);

    MockMinionProxy proxies[2];
    MasterMetadata metadata;
    const UUID m0(45, 0, 0, 0);
    const UUID m1(46, 0, 0, 0);
    metadata.RegisterNode(m0, proxies[0], 4096);
    metadata.RegisterNode(m1, proxies[1], 4096);
    metadata.SetNodeActive(m0, false);
    RAIDManager raid_manager(metadata, RAIDManager::Config{1024});

    const std::vector<RAIDManager::PlacementSegment> placements =
        raid_manager.ResolveReadPlacements(0, 512);

    ASSERT_EQ(suite, 1u, placements.size());
    ASSERT_TRUE(suite, placements[0].primary.node_id == m0);
    ASSERT_FALSE(suite, placements[0].primary.active);
    ASSERT_TRUE(suite, placements[0].mirror.has_value());
    ASSERT_TRUE(suite, placements[0].mirror->node_id == m1);
    ASSERT_TRUE(suite, placements[0].mirror->active);

    bool compatibility_threw = false;
    try
    {
        raid_manager.ResolveReadTarget(0, 512);
    }
    catch (const std::logic_error&)
    {
        compatibility_threw = true;
    }

    ASSERT_TRUE(suite, compatibility_threw);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

void TestRAIDManagerCapacityAndCompatibilityBoundaries()
{
    INIT_SUITE(suite, "RAIDManager Capacity And Compatibility Boundaries");
    BEGIN_SUITE(suite);

    MockMinionProxy proxies[2];
    MasterMetadata metadata;
    metadata.RegisterNode(UUID(50, 0, 0, 0), proxies[0], 4096);
    metadata.RegisterNode(UUID(51, 0, 0, 0), proxies[1], 2048);
    RAIDManager raid_manager(metadata, RAIDManager::Config{1024});

    ASSERT_EQ(suite, 2048ULL, metadata.GetMinimumCapacity());
    ASSERT_EQ(suite, 4096ULL, metadata.GetExposedCapacity());
    ASSERT_EQ(suite, 2048ULL, raid_manager.GetExposedCapacity());
    ASSERT_EQ(suite, 1024ULL, raid_manager.GetStripeSize());
    ASSERT_TRUE(suite, &raid_manager.ResolveReadTarget(0, 1024) == &proxies[0]);
    ASSERT_TRUE(suite, &raid_manager.ResolveReadTarget(1024, 1024) == &proxies[1]);

    bool cross_stripe_threw = false;
    try
    {
        raid_manager.ResolveReadTarget(512, 1024);
    }
    catch (const std::invalid_argument&)
    {
        cross_stripe_threw = true;
    }

    bool out_of_range_threw = false;
    try
    {
        raid_manager.ResolveWritePlacements(2044, 8);
    }
    catch (const std::out_of_range&)
    {
        out_of_range_threw = true;
    }

    bool zero_stripe_threw = false;
    try
    {
        RAIDManager invalid(metadata, RAIDManager::Config{0});
        (void)invalid;
    }
    catch (const std::invalid_argument&)
    {
        zero_stripe_threw = true;
    }

    ASSERT_TRUE(suite, cross_stripe_threw);
    ASSERT_TRUE(suite, out_of_range_threw);
    ASSERT_TRUE(suite, zero_stripe_threw);

    PRINT_SUITE_SUMMARY(suite);
    END_SUITE(suite);
}

} // namespace

int main()
{
    PRINT_TEST_HEADER("MasterMetadata");

    TestRegisterPrimaryNode();
    TestUpdateNodeHealthAndActive();
    TestOutOfSyncTracking();
    TestRejectInvalidMetadata();
    TestRAIDManagerUsesMetadataCapacity();
    TestRAIDManagerPrimaryAndMirrorPlacement();
    TestRAIDManagerSupportsOddNodeNextMirror();
    TestRAIDManagerLocalOffsetsAndSplitting();
    TestRAIDManagerSingleMinionFallback();
    TestRAIDManagerKeepsInactiveTargetsForDegradedPolicy();
    TestRAIDManagerCapacityAndCompatibilityBoundaries();

    PRINT_SUMMARY();
    return 0;
}
