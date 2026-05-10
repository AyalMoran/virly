/**
 * @file NBDProxy.hpp
 * @brief Declares the framework input proxy for Linux NBD requests.
 */
#ifndef ILRD_CONCRETE_NBD_PROXY_HPP
#define ILRD_CONCRETE_NBD_PROXY_HPP

#include <map>
#include <mutex>

#include "Framework.hpp"
#include "nbd/NBDCommunicator.hpp"
#include "response/ResponseManager.hpp"

namespace ilrd::concrete
{

/**
 * @brief Converts NBD requests into framework tasks and routes completions back.
 */
class NBDProxy : public IInputProxy
{
  public:
    /**
     * @brief Binds the proxy to an existing communicator.
     * @param communicator NBD communicator used for request/response I/O.
     */
    explicit NBDProxy(NBDCommunicator& communicator);

    /**
     * @brief Reads and converts one NBD request into a framework task.
     * @param fd Ready descriptor supplied by the framework.
     * @return Newly allocated task owned by the caller.
     */
    ITask* GetTask(int fd) override;

    /**
     * @brief Sends the final aggregated response for a pending NBD request.
     * @param completion Completed response information.
     */
    void SendResponse(const ResponseManager::ResponseCompletion& completion);

  private:
    struct PendingRequest
    {
        NBDCommunicator::Request request;
        wire::MessageType expected_response_type = wire::MessageType::READ_RESP;
    };

    ITask* BuildTask(const NBDCommunicator::Request& request,
                     const UUID& request_id) const;
    void StorePending(const UUID& request_id,
                      const NBDCommunicator::Request& request,
                      wire::MessageType expected_response_type);
    bool TakePending(const UUID& request_id, PendingRequest& out);
    static wire::MessageType ExpectedResponseType(
        NBDCommunicator::RequestType request_type);
    static int ErrorCodeForCompletion(
        const ResponseManager::ResponseCompletion& completion);

    NBDCommunicator& m_communicator;
    std::mutex m_mutex;
    std::map<UUID, PendingRequest> m_pending;
};

} // namespace ilrd::concrete

#endif // ILRD_CONCRETE_NBD_PROXY_HPP
