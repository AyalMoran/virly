/**
 * @file RAIDManager.hpp
 * @brief Declares logical-to-physical placement for master requests.
 */
#ifndef ILRD_CONCRETE_RAID_MANAGER_HPP
#define ILRD_CONCRETE_RAID_MANAGER_HPP

#include <cstdint>
#include <optional>
#include <vector>

#include "metadata/MasterMetadata.hpp"
#include "transport/IMinionProxy.hpp"

namespace ilrd::concrete
{

/**
 * @brief Resolves logical requests into one or more minion placement targets.
 */
class RAIDManager
{
  public:
    /**
     * @brief Placement configuration values.
     */
    struct Config
    {
        explicit Config(std::uint64_t stripe_size_ = 4096)
            : stripe_size(stripe_size_)
        {
        }

        std::uint64_t stripe_size;
    };

    /**
     * @brief Role a target plays within a mirrored placement.
     */
    enum class TargetRole
    {
        PRIMARY,
        MIRROR
    };

    /**
     * @brief Concrete target selected for one placement fragment.
     */
    struct PlacementTarget
    {
        UUID node_id = UUID(0, 0, 0, 0);
        IMinionProxy* proxy = nullptr;
        std::uint64_t local_offset = 0;
        std::uint32_t length = 0;
        TargetRole role = TargetRole::PRIMARY;
        bool active = true;
        wire::HealthState health_state = wire::HealthState::HEALTHY;
    };

    /**
     * @brief Logical segment mapped to one primary target and optional mirror.
     */
    struct PlacementSegment
    {
        std::uint64_t logical_offset = 0;
        std::uint32_t length = 0;
        PlacementTarget primary;
        std::optional<PlacementTarget> mirror;
    };

    explicit RAIDManager(MasterMetadata& metadata);
    RAIDManager(MasterMetadata& metadata, Config config);
    explicit RAIDManager(IMinionProxy& single_minion_proxy);
    RAIDManager(IMinionProxy& single_minion_proxy, Config config);

    IMinionProxy& ResolveReadTarget(std::uint64_t logical_offset,
                                    std::uint32_t length);
    IMinionProxy& ResolveWriteTarget(std::uint64_t logical_offset,
                                     std::uint32_t length);
    IMinionProxy& ResolveFlushTarget();
    std::vector<PlacementTarget> ResolveFlushTargets() const;
    std::vector<PlacementSegment> ResolveReadPlacements(
        std::uint64_t logical_offset,
        std::uint32_t length) const;
    std::vector<PlacementSegment> ResolveWritePlacements(
        std::uint64_t logical_offset,
        std::uint32_t length) const;
    void MarkNodeOutOfSync(const UUID& node_id);
    void ClearNodeOutOfSync(const UUID& node_id);
    bool IsNodeOutOfSync(const UUID& node_id) const;
    std::uint64_t GetStripeSize() const;
    std::uint64_t GetExposedCapacity() const;
    std::size_t GetNodeCount() const;

  private:
    std::vector<PlacementSegment> ResolvePlacements(
        std::uint64_t logical_offset,
        std::uint32_t length) const;
    PlacementSegment ResolveSegment(std::uint64_t logical_offset,
                                    std::uint32_t length) const;
    PlacementTarget MakeTarget(std::size_t node_index,
                               std::uint64_t local_offset,
                               std::uint32_t length,
                               TargetRole role) const;
    IMinionProxy& ResolvePrimaryTarget(std::uint64_t logical_offset,
                                       std::uint32_t length) const;
    void ValidateLogicalRange(std::uint64_t logical_offset,
                              std::uint32_t length) const;
    static MasterMetadata& CreateSingleMinionMetadata(
        IMinionProxy& single_minion_proxy);
    static UUID& SingleMinionNodeId();

    MasterMetadata& m_metadata;
    Config m_config;
};

} // namespace ilrd::concrete

#endif // ILRD_CONCRETE_RAID_MANAGER_HPP
