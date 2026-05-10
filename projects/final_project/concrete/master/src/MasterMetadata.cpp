#include "metadata/MasterMetadata.hpp"

#include <limits>
#include <string>

#include "DebugLogger.hpp"

namespace ilrd::concrete
{

void MasterMetadata::RegisterNode(const UUID& node_id,
                                  IMinionProxy& proxy,
                                  std::uint64_t capacity_bytes,
                                  wire::HealthState health_state)
{
    if (0 == capacity_bytes)
    {
        throw std::invalid_argument("MasterMetadata node capacity must be nonzero");
    }

    NodeMap::iterator iter = m_nodes.find(node_id);
    if (m_nodes.end() == iter)
    {
        NodeInfo info;
        info.node_id = node_id;
        info.proxy = &proxy;
        info.capacity_bytes = capacity_bytes;
        info.health_state = health_state;
        info.active = true;
        info.out_of_sync = false;

        m_nodes.insert(NodeMap::value_type(node_id, info));
        m_nodeOrder.push_back(node_id);
        ILRD_DEBUG_LOG("MasterMetadata registered node " + node_id.ToString() +
                       " capacity_bytes=" +
                       std::to_string(capacity_bytes));
        return;
    }

    iter->second.proxy = &proxy;
    iter->second.capacity_bytes = capacity_bytes;
    iter->second.health_state = health_state;
    iter->second.active = true;
    ILRD_DEBUG_LOG("MasterMetadata refreshed node " + node_id.ToString());
}

bool MasterMetadata::ContainsNode(const UUID& node_id) const
{
    return m_nodes.end() != m_nodes.find(node_id);
}

const MasterMetadata::NodeInfo& MasterMetadata::GetNode(
    const UUID& node_id) const
{
    return FindOrThrow(node_id)->second;
}

MasterMetadata::NodeInfo& MasterMetadata::GetNode(const UUID& node_id)
{
    return FindOrThrow(node_id)->second;
}

void MasterMetadata::SetNodeHealth(const UUID& node_id,
                                   wire::HealthState health_state)
{
    FindOrThrow(node_id)->second.health_state = health_state;
    ILRD_DEBUG_LOG("MasterMetadata updated node health " + node_id.ToString() +
                   " health=" +
                   std::to_string(static_cast<int>(health_state)));
}

void MasterMetadata::SetNodeActive(const UUID& node_id, bool active)
{
    FindOrThrow(node_id)->second.active = active;
    ILRD_DEBUG_LOG("MasterMetadata set node active " + node_id.ToString() +
                   " active=" + std::to_string(static_cast<int>(active)));
}

void MasterMetadata::MarkNodeOutOfSync(const UUID& node_id)
{
    FindOrThrow(node_id)->second.out_of_sync = true;
    ILRD_DEBUG_LOG_LEVEL("MasterMetadata marked node out-of-sync " +
                             node_id.ToString(),
                         Logger::Level::WARNING);
}

void MasterMetadata::ClearNodeOutOfSync(const UUID& node_id)
{
    FindOrThrow(node_id)->second.out_of_sync = false;
    ILRD_DEBUG_LOG("MasterMetadata cleared out-of-sync for " +
                   node_id.ToString());
}

bool MasterMetadata::IsNodeOutOfSync(const UUID& node_id) const
{
    return FindOrThrow(node_id)->second.out_of_sync;
}

const UUID& MasterMetadata::GetPrimaryNodeId() const
{
    if (m_nodeOrder.empty())
    {
        throw std::logic_error("MasterMetadata has no registered nodes");
    }

    return m_nodeOrder.front();
}

IMinionProxy& MasterMetadata::GetPrimaryProxy() const
{
    const NodeInfo& node = GetNode(GetPrimaryNodeId());
    if (nullptr == node.proxy)
    {
        throw std::logic_error("MasterMetadata primary node has no proxy");
    }

    if (!node.active)
    {
        throw std::logic_error("MasterMetadata primary node is inactive");
    }

    return *node.proxy;
}

std::uint64_t MasterMetadata::GetPrimaryCapacity() const
{
    return GetNode(GetPrimaryNodeId()).capacity_bytes;
}

wire::HealthState MasterMetadata::GetPrimaryHealth() const
{
    return GetNode(GetPrimaryNodeId()).health_state;
}

std::size_t MasterMetadata::NodeCount() const
{
    return m_nodes.size();
}

const std::vector<UUID>& MasterMetadata::GetNodeOrder() const
{
    return m_nodeOrder;
}

const UUID& MasterMetadata::GetNodeIdAt(std::size_t index) const
{
    if (index >= m_nodeOrder.size())
    {
        throw std::out_of_range("MasterMetadata node index is out of range");
    }

    return m_nodeOrder[index];
}

const MasterMetadata::NodeInfo& MasterMetadata::GetNodeAt(
    std::size_t index) const
{
    return GetNode(GetNodeIdAt(index));
}

MasterMetadata::NodeInfo& MasterMetadata::GetNodeAt(std::size_t index)
{
    return GetNode(GetNodeIdAt(index));
}

std::uint64_t MasterMetadata::GetMinimumCapacity() const
{
    if (m_nodeOrder.empty())
    {
        throw std::logic_error("MasterMetadata has no registered nodes");
    }

    std::uint64_t minimum = std::numeric_limits<std::uint64_t>::max();
    for (const UUID& node_id : m_nodeOrder)
    {
        const NodeInfo& node = GetNode(node_id);
        if (node.capacity_bytes < minimum)
        {
            minimum = node.capacity_bytes;
        }
    }

    return minimum;
}

std::uint64_t MasterMetadata::GetExposedCapacity() const
{
    const std::uint64_t minimum = GetMinimumCapacity();
    const std::size_t count = NodeCount();
    if (count > std::numeric_limits<std::uint64_t>::max() / minimum)
    {
        throw std::overflow_error("MasterMetadata exposed capacity overflow");
    }

    return minimum * static_cast<std::uint64_t>(count);
}

MasterMetadata::NodeMap::const_iterator MasterMetadata::FindOrThrow(
    const UUID& node_id) const
{
    NodeMap::const_iterator iter = m_nodes.find(node_id);
    if (m_nodes.end() == iter)
    {
        throw std::out_of_range("MasterMetadata node id is not registered");
    }

    return iter;
}

MasterMetadata::NodeMap::iterator MasterMetadata::FindOrThrow(
    const UUID& node_id)
{
    NodeMap::iterator iter = m_nodes.find(node_id);
    if (m_nodes.end() == iter)
    {
        throw std::out_of_range("MasterMetadata node id is not registered");
    }

    return iter;
}

} // namespace ilrd::concrete
