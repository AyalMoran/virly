/**
 * @file MinionRuntime.hpp
 * @brief Declares runtime state shared by minion commands.
 */
#ifndef ILRD_CONCRETE_MINION_RUNTIME_HPP
#define ILRD_CONCRETE_MINION_RUNTIME_HPP

#include "identity/UUID.hpp"
#include "storage/MinionStorageBackend.hpp"
#include "wire/WireProtocol.hpp"

namespace ilrd::concrete
{

class MasterProxy;

/**
 * @brief Holds the storage, transport, and identity state for a minion process.
 */
class MinionRuntime
{
  public:
    /**
     * @brief Creates a runtime bound to storage and master transport objects.
     * @param storage Backend used to serve read/write/flush requests.
     * @param proxy Transport used to send responses to the master.
     * @param node_id UUID advertised by this minion.
     * @param health_state Initial heartbeat health state.
     */
    MinionRuntime(MinionStorageBackend& storage, MasterProxy& proxy,
                  const UUID& node_id = UUID(),
                  wire::HealthState health_state = wire::HealthState::HEALTHY);

    MinionStorageBackend& GetStorage();
    const MinionStorageBackend& GetStorage() const;
    MasterProxy& GetProxy();
    const MasterProxy& GetProxy() const;
    const UUID& GetNodeId() const;
    wire::HealthState GetHealthState() const;

  private:
    MinionStorageBackend& m_storage;
    MasterProxy& m_proxy;
    UUID m_nodeId;
    wire::HealthState m_healthState;
};

/**
 * @brief Sets the thread-global active minion runtime.
 * @param runtime Runtime instance that subsequent helpers should use.
 */
void SetActiveMinionRuntime(MinionRuntime& runtime);

/**
 * @brief Clears the active minion runtime pointer.
 */
void ClearActiveMinionRuntime();

/**
 * @brief Returns the active minion runtime.
 * @return Active runtime reference.
 *
 * Caller must ensure an active runtime was previously installed.
 */
MinionRuntime& GetActiveMinionRuntime();

} // namespace ilrd::concrete

#endif // ILRD_CONCRETE_MINION_RUNTIME_HPP
