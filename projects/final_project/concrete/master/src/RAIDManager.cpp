#include "placement/RAIDManager.hpp"

#include <algorithm>
#include <cstdint>
#include <limits>
#include <stdexcept>
#include <string>

#include "DebugLogger.hpp"

namespace ilrd::concrete
{

namespace
{

std::uint64_t AlignDown(std::uint64_t value, std::uint64_t alignment)
{
    if (0 == alignment)
    {
        return value;
    }

    return value - (value % alignment);
}

} // namespace

RAIDManager::RAIDManager(MasterMetadata& metadata)
    : RAIDManager(metadata, Config())
{
}

RAIDManager::RAIDManager(MasterMetadata& metadata, Config config)
    : m_metadata(metadata), m_config(config)
{
    if (0 == m_config.stripe_size)
    {
        throw std::invalid_argument("RAIDManager stripe size must be nonzero");
    }

    ILRD_DEBUG_LOG("RAIDManager constructed with stripe_size=" +
                   std::to_string(m_config.stripe_size));
}

RAIDManager::RAIDManager(IMinionProxy& single_minion_proxy)
    : RAIDManager(single_minion_proxy, Config())
{
}

RAIDManager::RAIDManager(IMinionProxy& single_minion_proxy, Config config)
    : RAIDManager(CreateSingleMinionMetadata(single_minion_proxy), config)
{
}

IMinionProxy& RAIDManager::ResolveReadTarget(std::uint64_t logical_offset,
                                             std::uint32_t length)
{
    return ResolvePrimaryTarget(logical_offset, length);
}

IMinionProxy& RAIDManager::ResolveWriteTarget(std::uint64_t logical_offset,
                                              std::uint32_t length)
{
    return ResolvePrimaryTarget(logical_offset, length);
}

IMinionProxy& RAIDManager::ResolveFlushTarget()
{
    ILRD_DEBUG_LOG("RAIDManager resolving flush target");
    return m_metadata.GetPrimaryProxy();
}

std::vector<RAIDManager::PlacementTarget> RAIDManager::ResolveFlushTargets() const
{
    std::vector<PlacementTarget> targets;
    for (std::size_t i = 0; i < m_metadata.NodeCount(); ++i)
    {
        const MasterMetadata::NodeInfo& node = m_metadata.GetNodeAt(i);
        if (!node.active)
        {
            continue;
        }

        targets.push_back(MakeTarget(i, 0, 0, TargetRole::PRIMARY));
    }

    return targets;
}

std::vector<RAIDManager::PlacementSegment> RAIDManager::ResolveReadPlacements(
    std::uint64_t logical_offset,
    std::uint32_t length) const
{
    return ResolvePlacements(logical_offset, length);
}

std::vector<RAIDManager::PlacementSegment> RAIDManager::ResolveWritePlacements(
    std::uint64_t logical_offset,
    std::uint32_t length) const
{
    return ResolvePlacements(logical_offset, length);
}

void RAIDManager::MarkNodeOutOfSync(const UUID& node_id)
{
    m_metadata.MarkNodeOutOfSync(node_id);
    ILRD_DEBUG_LOG_LEVEL("RAIDManager marked node out-of-sync " +
                             node_id.ToString(),
                         Logger::Level::WARNING);
}

void RAIDManager::ClearNodeOutOfSync(const UUID& node_id)
{
    m_metadata.ClearNodeOutOfSync(node_id);
    ILRD_DEBUG_LOG("RAIDManager cleared node out-of-sync " + node_id.ToString());
}

bool RAIDManager::IsNodeOutOfSync(const UUID& node_id) const
{
    return m_metadata.IsNodeOutOfSync(node_id);
}

std::uint64_t RAIDManager::GetStripeSize() const
{
    return m_config.stripe_size;
}

std::uint64_t RAIDManager::GetExposedCapacity() const
{
    if (0 == m_metadata.NodeCount())
    {
        throw std::logic_error("RAIDManager has no registered nodes");
    }

    const bool mirrored = m_metadata.NodeCount() > 1;
    std::uint64_t minimum = std::numeric_limits<std::uint64_t>::max();
    for (std::size_t i = 0; i < m_metadata.NodeCount(); ++i)
    {
        const MasterMetadata::NodeInfo& node = m_metadata.GetNodeAt(i);
        std::uint64_t usable_capacity = node.capacity_bytes;
        if (mirrored)
        {
            usable_capacity /= 2;
        }

        usable_capacity = AlignDown(usable_capacity, m_config.stripe_size);
        if (usable_capacity < minimum)
        {
            minimum = usable_capacity;
        }
    }

    if (m_metadata.NodeCount() >
        std::numeric_limits<std::uint64_t>::max() / minimum)
    {
        throw std::overflow_error("RAIDManager exposed capacity overflow");
    }

    return minimum * static_cast<std::uint64_t>(m_metadata.NodeCount());
}

std::size_t RAIDManager::GetNodeCount() const
{
    return m_metadata.NodeCount();
}

std::vector<RAIDManager::PlacementSegment> RAIDManager::ResolvePlacements(
    std::uint64_t logical_offset,
    std::uint32_t length) const
{
    ILRD_DEBUG_LOG("RAIDManager resolving placements offset=" +
                   std::to_string(logical_offset) + " length=" +
                   std::to_string(length));
    ValidateLogicalRange(logical_offset, length);

    std::vector<PlacementSegment> placements;
    std::uint64_t current_offset = logical_offset;
    std::uint32_t remaining = length;

    while (0 != remaining)
    {
        const std::uint64_t offset_in_stripe =
            current_offset % m_config.stripe_size;
        const std::uint64_t available_in_stripe =
            m_config.stripe_size - offset_in_stripe;
        const std::uint32_t segment_length =
            static_cast<std::uint32_t>(std::min<std::uint64_t>(
                remaining, available_in_stripe));

        placements.push_back(ResolveSegment(current_offset, segment_length));

        current_offset += segment_length;
        remaining -= segment_length;
    }

    return placements;
}

RAIDManager::PlacementSegment RAIDManager::ResolveSegment(
    std::uint64_t logical_offset,
    std::uint32_t length) const
{
    const std::size_t node_count = m_metadata.NodeCount();
    if (0 == node_count)
    {
        throw std::logic_error("RAIDManager has no registered nodes");
    }

    const std::uint64_t stripe_index = logical_offset / m_config.stripe_size;
    const std::size_t primary_index =
        static_cast<std::size_t>(stripe_index %
                                 static_cast<std::uint64_t>(node_count));
    const std::uint64_t local_stripe_index =
        stripe_index / static_cast<std::uint64_t>(node_count);
    const std::uint64_t local_offset =
        (local_stripe_index * m_config.stripe_size) +
        (logical_offset % m_config.stripe_size);

    PlacementSegment segment;
    segment.logical_offset = logical_offset;
    segment.length = length;
    segment.primary =
        MakeTarget(primary_index, local_offset, length, TargetRole::PRIMARY);
    ILRD_DEBUG_LOG("RAIDManager resolved primary target node=" +
                   segment.primary.node_id.ToString() + " local_offset=" +
                   std::to_string(local_offset) + " length=" +
                   std::to_string(length));

    if (node_count > 1)
    {
        const std::size_t mirror_index = (primary_index + 1) % node_count;
        segment.mirror =
            MakeTarget(mirror_index, local_offset, length, TargetRole::MIRROR);
        ILRD_DEBUG_LOG("RAIDManager resolved mirror target node=" +
                       segment.mirror->node_id.ToString());
    }

    return segment;
}

RAIDManager::PlacementTarget RAIDManager::MakeTarget(
    std::size_t node_index,
    std::uint64_t local_offset,
    std::uint32_t length,
    TargetRole role) const
{
    const bool mirrored = m_metadata.NodeCount() > 1;
    const MasterMetadata::NodeInfo& node = m_metadata.GetNodeAt(node_index);
    if (nullptr == node.proxy)
    {
        throw std::logic_error("RAIDManager target node has no proxy");
    }

    std::uint64_t usable_capacity = node.capacity_bytes;
    if (mirrored)
    {
        usable_capacity /= 2;
    }

    usable_capacity = AlignDown(usable_capacity, m_config.stripe_size);
    if (local_offset > usable_capacity ||
        static_cast<std::uint64_t>(length) > usable_capacity - local_offset)
    {
        throw std::out_of_range("RAIDManager target operation exceeds capacity");
    }

    std::uint64_t target_offset = local_offset;
    if (mirrored && TargetRole::MIRROR == role)
    {
        target_offset += usable_capacity;
    }

    PlacementTarget target;
    target.node_id = node.node_id;
    target.proxy = node.proxy;
    target.local_offset = target_offset;
    target.length = length;
    target.role = role;
    target.active = node.active;
    target.health_state = node.health_state;
    return target;
}

IMinionProxy& RAIDManager::ResolvePrimaryTarget(std::uint64_t logical_offset,
                                                std::uint32_t length) const
{
    ValidateLogicalRange(logical_offset, length);
    if (0 == length)
    {
        return m_metadata.GetPrimaryProxy();
    }

    if (1 == m_metadata.NodeCount())
    {
        return m_metadata.GetPrimaryProxy();
    }

    const std::vector<PlacementSegment> placements =
        ResolvePlacements(logical_offset, length);
    if (1 != placements.size())
    {
        throw std::invalid_argument(
            "RAIDManager compatibility target requires one stripe segment");
    }

    if (!placements.front().primary.active)
    {
        throw std::logic_error("RAIDManager primary target node is inactive");
    }

    return *placements.front().primary.proxy;
}

void RAIDManager::ValidateLogicalRange(std::uint64_t logical_offset,
                                       std::uint32_t length) const
{
    const std::uint64_t capacity = GetExposedCapacity();
    if (logical_offset > capacity)
    {
        throw std::out_of_range("RAIDManager logical offset exceeds capacity");
    }

    if (static_cast<std::uint64_t>(length) > capacity - logical_offset)
    {
        throw std::out_of_range("RAIDManager operation exceeds capacity");
    }
}

MasterMetadata& RAIDManager::CreateSingleMinionMetadata(
    IMinionProxy& single_minion_proxy)
{
    static MasterMetadata metadata;
    metadata.RegisterNode(SingleMinionNodeId(), single_minion_proxy,
                          static_cast<std::uint64_t>(-1));
    return metadata;
}

UUID& RAIDManager::SingleMinionNodeId()
{
    static UUID node_id(0, 0, 0, 1);
    return node_id;
}

} // namespace ilrd::concrete
