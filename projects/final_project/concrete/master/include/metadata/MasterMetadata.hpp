/**
 * @file MasterMetadata.hpp
 * @brief Declares cluster metadata tracked by the master node.
 */
#ifndef ILRD_CONCRETE_MASTER_METADATA_HPP
#define ILRD_CONCRETE_MASTER_METADATA_HPP

#include <cstdint>
#include <map>
#include <stdexcept>
#include <vector>

#include "identity/UUID.hpp"
#include "transport/IMinionProxy.hpp"
#include "wire/WireProtocol.hpp"

namespace ilrd::concrete
{

/**
 * @brief Stores ordered metadata about the minion nodes known to the master.
 */
class MasterMetadata
{
  public:
    /**
     * @brief Metadata recorded for a single minion node.
     */
    struct NodeInfo
    {
        UUID node_id = UUID(0, 0, 0, 0);
        IMinionProxy* proxy = nullptr;
        std::uint64_t capacity_bytes = 0;
        wire::HealthState health_state = wire::HealthState::HEALTHY;
        bool active = true;
        bool out_of_sync = false;
    };

    void RegisterNode(const UUID& node_id,
                      IMinionProxy& proxy,
                      std::uint64_t capacity_bytes,
                      wire::HealthState health_state =
                          wire::HealthState::HEALTHY);
    bool ContainsNode(const UUID& node_id) const;
    const NodeInfo& GetNode(const UUID& node_id) const;
    NodeInfo& GetNode(const UUID& node_id);
    void SetNodeHealth(const UUID& node_id, wire::HealthState health_state);
    void SetNodeActive(const UUID& node_id, bool active);
    void MarkNodeOutOfSync(const UUID& node_id);
    void ClearNodeOutOfSync(const UUID& node_id);
    bool IsNodeOutOfSync(const UUID& node_id) const;

    /**
     * @brief Returns the first registered node, treated as primary.
     * @return UUID of the primary node.
     */
    const UUID& GetPrimaryNodeId() const;

    /**
     * @brief Returns the transport proxy for the primary node.
     * @return Proxy associated with the first registered node.
     */
    IMinionProxy& GetPrimaryProxy() const;

    /**
     * @brief Returns the capacity of the primary node.
     * @return Capacity in bytes.
     */
    std::uint64_t GetPrimaryCapacity() const;

    /**
     * @brief Returns the current health state of the primary node.
     * @return Primary node health state.
     */
    wire::HealthState GetPrimaryHealth() const;

    /**
     * @brief Returns the number of registered nodes.
     * @return Node count.
     */
    std::size_t NodeCount() const;

    /**
     * @brief Returns the stable node order used for placement.
     * @return Ordered vector of node ids.
     */
    const std::vector<UUID>& GetNodeOrder() const;

    const UUID& GetNodeIdAt(std::size_t index) const;
    const NodeInfo& GetNodeAt(std::size_t index) const;
    NodeInfo& GetNodeAt(std::size_t index);
    std::uint64_t GetMinimumCapacity() const;
    std::uint64_t GetExposedCapacity() const;

  private:
    using NodeMap = std::map<UUID, NodeInfo>;

    NodeMap::const_iterator FindOrThrow(const UUID& node_id) const;
    NodeMap::iterator FindOrThrow(const UUID& node_id);

    NodeMap m_nodes;
    std::vector<UUID> m_nodeOrder;
};

} // namespace ilrd::concrete

#endif // ILRD_CONCRETE_MASTER_METADATA_HPP
