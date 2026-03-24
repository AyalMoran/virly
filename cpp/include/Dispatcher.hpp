/**************************************************************
 * File    : Dispatcher.hpp
 * Author  : Ayal Moran
 * Reviewer: Chaya T.
 * Date    : 24-03-2026
 **************************************************************/
#ifndef ILRD_DISPATCHER_HPP
#define ILRD_DISPATCHER_HPP

#include <unordered_set> // std::unordered_set

namespace ilrd
{

template <typename Event> class Dispatcher;

template <typename Event>
class ACallback
{
  public:
    ACallback() noexcept;
    virtual ~ACallback() noexcept;

    ACallback(const ACallback&) = delete;
    ACallback& operator=(const ACallback&) = delete;
    ACallback(ACallback&&) = delete;
    ACallback& operator=(ACallback&&) = delete;

    virtual void Notify(const Event& event) = 0;
    virtual void NotifyDeath();
    Dispatcher<Event>* GetDispatcher() const noexcept;

  private:
    void SetDispatcher(Dispatcher<Event>* dispatcher) noexcept;

    Dispatcher<Event>* m_dispatcher;

    friend class Dispatcher<Event>;
};

template <typename Event, typename Observer>
class Callback : public ACallback<Event>
{
  public:
    using NotifyFunc = void (Observer::*)(const Event&);
    using NotifyDeathFunc = void (Observer::*)();

    Callback(Observer& obs_, NotifyFunc on_event,
             NotifyDeathFunc on_death = nullptr) noexcept;

    void Notify(const Event& event) override;
    void NotifyDeath() override;

  private:
    Observer& m_observer;
    NotifyFunc m_onEvent;
    NotifyDeathFunc m_onDeath;
};

template <typename Event>
class Dispatcher
{
  public:
    Dispatcher();
    ~Dispatcher();

    Dispatcher(const Dispatcher&) = delete;
    Dispatcher& operator=(const Dispatcher&) = delete;
    Dispatcher(Dispatcher&&) = delete;
    Dispatcher& operator=(Dispatcher&&) = delete;

    void Subscribe(ACallback<Event>* callback);
    void Unsubscribe(ACallback<Event>* callback) noexcept;
    void Broadcast(const Event& event);

  private:
    std::unordered_set<ACallback<Event>*> m_callbacks;
};

template <typename Event>
ACallback<Event>::ACallback() noexcept : m_dispatcher(nullptr)
{
}

template <typename Event>
ACallback<Event>::~ACallback() noexcept
{
    if (nullptr != m_dispatcher)
    {
        m_dispatcher->Unsubscribe(this);
    }
}

template <typename Event>
void ACallback<Event>::NotifyDeath()
{
}

template <typename Event>
Dispatcher<Event>* ACallback<Event>::GetDispatcher() const noexcept
{
    return m_dispatcher;
}

template <typename Event>
void ACallback<Event>::SetDispatcher(Dispatcher<Event>* dispatcher) noexcept
{
    m_dispatcher = dispatcher;
}

template <typename Event, typename Observer>
Callback<Event, Observer>::Callback(Observer& obs_, NotifyFunc on_event,
                                    NotifyDeathFunc on_death) noexcept
    : m_observer(obs_), m_onEvent(on_event), m_onDeath(on_death)
{
}

template <typename Event, typename Observer>
void Callback<Event, Observer>::Notify(const Event& event)
{
    (m_observer.*m_onEvent)(event);
}

template <typename Event, typename Observer>
void Callback<Event, Observer>::NotifyDeath()
{
    ACallback<Event>::NotifyDeath();

    if (nullptr != m_onDeath)
    {
        (m_observer.*m_onDeath)();
    }
    
}

template <typename Event>
Dispatcher<Event>::Dispatcher() : m_callbacks()
{
}

template <typename Event>
Dispatcher<Event>::~Dispatcher()
{
    const std::unordered_set<ACallback<Event>*> snapshot(m_callbacks);

    for (typename std::unordered_set<ACallback<Event>*>::const_iterator it =
             snapshot.begin();
         it != snapshot.end(); ++it)
    {
        (*it)->SetDispatcher(nullptr);
    }

    m_callbacks.clear();

    for (typename std::unordered_set<ACallback<Event>*>::const_iterator it =
             snapshot.begin();
         it != snapshot.end(); ++it)
    {
        (*it)->NotifyDeath();
    }
}

template <typename Event>
void Dispatcher<Event>::Subscribe(ACallback<Event>* callback)
{
    if (nullptr == callback)
    {
        return;
    }

    Dispatcher<Event>* existing_owner = callback->GetDispatcher();
    if (nullptr != existing_owner && existing_owner != this)
    {
        existing_owner->Unsubscribe(callback);
    }

    std::pair<typename std::unordered_set<ACallback<Event>*>::iterator, bool>
        inserted = m_callbacks.insert(callback);
    if (inserted.second)
    {
        callback->SetDispatcher(this);
    }
}

template <typename Event>
void Dispatcher<Event>::Unsubscribe(ACallback<Event>* callback) noexcept
{
    if (nullptr == callback)
    {
        return;
    }

    typename std::unordered_set<ACallback<Event>*>::iterator it =
        m_callbacks.find(callback);
    if (m_callbacks.end() == it)
    {
        return;
    }

    callback->SetDispatcher(nullptr);
    m_callbacks.erase(it);
}

template <typename Event>
void Dispatcher<Event>::Broadcast(const Event& event)
{
    const std::unordered_set<ACallback<Event>*> snapshot(m_callbacks);

    for (typename std::unordered_set<ACallback<Event>*>::const_iterator it =
             snapshot.begin();
         it != snapshot.end(); ++it)
    {
        if (m_callbacks.end() != m_callbacks.find(*it))
        {
            (*it)->Notify(event);
        }
    }
}

} // namespace ilrd

#endif /* ILRD_DISPATCHER_HPP */
