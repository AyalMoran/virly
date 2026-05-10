#include "runtime/MinionRuntime.hpp"

#include <mutex>
#include <stdexcept>
#include <string>

#include "DebugLogger.hpp"

namespace ilrd::concrete
{

namespace
{

MinionRuntime* g_activeRuntime = nullptr;
std::mutex g_runtimeMutex;

} // namespace

MinionRuntime::MinionRuntime(MinionStorageBackend& storage, MasterProxy& proxy,
                             const UUID& node_id, wire::HealthState health_state)
    : m_storage(storage),
      m_proxy(proxy),
      m_nodeId(node_id),
      m_healthState(health_state)
{
    ILRD_DEBUG_LOG("MinionRuntime constructed for node " + m_nodeId.ToString());
}

MinionStorageBackend& MinionRuntime::GetStorage()
{
    return m_storage;
}

const MinionStorageBackend& MinionRuntime::GetStorage() const
{
    return m_storage;
}

MasterProxy& MinionRuntime::GetProxy()
{
    return m_proxy;
}

const MasterProxy& MinionRuntime::GetProxy() const
{
    return m_proxy;
}

const UUID& MinionRuntime::GetNodeId() const
{
    return m_nodeId;
}

wire::HealthState MinionRuntime::GetHealthState() const
{
    return m_healthState;
}

void SetActiveMinionRuntime(MinionRuntime& runtime)
{
    std::lock_guard<std::mutex> lock(g_runtimeMutex);
    g_activeRuntime = &runtime;
    ILRD_DEBUG_LOG("MinionRuntime activated");
}

void ClearActiveMinionRuntime()
{
    std::lock_guard<std::mutex> lock(g_runtimeMutex);
    g_activeRuntime = nullptr;
    ILRD_DEBUG_LOG("MinionRuntime cleared");
}

MinionRuntime& GetActiveMinionRuntime()
{
    std::lock_guard<std::mutex> lock(g_runtimeMutex);
    if (nullptr == g_activeRuntime)
    {
        throw std::logic_error("No active MinionRuntime installed");
    }

    return *g_activeRuntime;
}

} // namespace ilrd::concrete
