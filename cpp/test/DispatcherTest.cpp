/**************************************************************
 * File    : DispatcherTest.cpp
 * Author  : Ayal Moran
 * Reviewer: Chaya T.
 * Date    : 24-03-2026
 **************************************************************/

#include <functional>

#include "Dispatcher.hpp"
#include "test_utils.hpp"

using namespace ilrd;

namespace
{

class DataModel
{
  public:
    typedef int EventType;

    DataModel()
        : m_dispatcher()
    {
    }

    void Subscribe(ACallback<EventType>* callback)
    {
        m_dispatcher.Subscribe(callback);
    }

    void Unsubscribe(ACallback<EventType>* callback)
    {
        m_dispatcher.Unsubscribe(callback);
    }

    void Broadcast(const EventType& event)
    {
        m_dispatcher.Broadcast(event);
    }

  private:
    Dispatcher<EventType> m_dispatcher;
};

class ViewWindow
{
  public:
    ViewWindow()
        : m_notifications(0), m_lastEvent(-1), m_deathNotified(false),
          m_callback(*this, &ViewWindow::OnEvent, &ViewWindow::OnPublisherDeath)
    {
    }

    Callback<DataModel::EventType, ViewWindow>* GetCallback()
    {
        return &m_callback;
    }

    int NotificationCount() const
    {
        return m_notifications;
    }

    int LastEvent() const
    {
        return m_lastEvent;
    }

    bool DeathNotified() const
    {
        return m_deathNotified;
    }

  private:
    void OnEvent(const DataModel::EventType& event)
    {
        ++m_notifications;
        m_lastEvent = event;
    }

    void OnPublisherDeath()
    {
        m_deathNotified = true;
    }

    int m_notifications;
    int m_lastEvent;
    bool m_deathNotified;
    Callback<DataModel::EventType, ViewWindow> m_callback;
};

class ControlWindow
{
  public:
    ControlWindow()
        : m_notifications(0), m_lastEvent(-1), m_deathNotified(false),
          m_onEventAction(), m_callback(*this, &ControlWindow::OnEvent,
                                        &ControlWindow::OnPublisherDeath)
    {
    }

    Callback<DataModel::EventType, ControlWindow>* GetCallback()
    {
        return &m_callback;
    }

    void SetOnEventAction(std::function<void()> action)
    {
        m_onEventAction = action;
    }

    int NotificationCount() const
    {
        return m_notifications;
    }

    int LastEvent() const
    {
        return m_lastEvent;
    }

    bool DeathNotified() const
    {
        return m_deathNotified;
    }

  private:
    void OnEvent(const DataModel::EventType& event)
    {
        ++m_notifications;
        m_lastEvent = event;
        if (m_onEventAction)
        {
            m_onEventAction();
        }
    }

    void OnPublisherDeath()
    {
        m_deathNotified = true;
    }

    int m_notifications;
    int m_lastEvent;
    bool m_deathNotified;
    std::function<void()> m_onEventAction;
    Callback<DataModel::EventType, ControlWindow> m_callback;
};

void Test_BroadcastToOneObserver()
{
    INIT_SUITE(suite, "Broadcast to one observer");
    BEGIN_SUITE(suite);

    DataModel model;
    ViewWindow view;
    model.Subscribe(view.GetCallback());

    model.Broadcast(10);

    RUN_TEST(suite, "view received one event", view.NotificationCount() == 1);
    RUN_TEST(suite, "view event payload is correct", view.LastEvent() == 10);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void Test_BroadcastToTwoObservers()
{
    INIT_SUITE(suite, "Broadcast to two observers");
    BEGIN_SUITE(suite);

    DataModel model;
    ViewWindow view;
    ControlWindow control;
    model.Subscribe(view.GetCallback());
    model.Subscribe(control.GetCallback());

    model.Broadcast(20);

    RUN_TEST(suite, "view received event", view.NotificationCount() == 1);
    RUN_TEST(suite, "control received event", control.NotificationCount() == 1);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void Test_BroadcastToThreeObservers()
{
    INIT_SUITE(suite, "Broadcast to three observers");
    BEGIN_SUITE(suite);

    DataModel model;
    ViewWindow view1;
    ViewWindow view2;
    ControlWindow control;
    model.Subscribe(view1.GetCallback());
    model.Subscribe(view2.GetCallback());
    model.Subscribe(control.GetCallback());

    model.Broadcast(30);

    RUN_TEST(suite, "view1 received event", view1.NotificationCount() == 1);
    RUN_TEST(suite, "view2 received event", view2.NotificationCount() == 1);
    RUN_TEST(suite, "control received event", control.NotificationCount() == 1);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void Test_RemoveOneObserverDuringBroadcast()
{
    INIT_SUITE(suite, "Remove one observer during broadcast");
    BEGIN_SUITE(suite);

    DataModel model;
    ViewWindow stay;
    ViewWindow removed;
    ControlWindow remover;

    remover.SetOnEventAction([&model, &removed]() {
        model.Unsubscribe(removed.GetCallback());
    });

    model.Subscribe(stay.GetCallback());
    model.Subscribe(removed.GetCallback());
    model.Subscribe(remover.GetCallback());

    model.Broadcast(1);
    const int removed_after_first = removed.NotificationCount();
    model.Broadcast(2);

    RUN_TEST(suite, "removed observer gets no more events",
             removed.NotificationCount() == removed_after_first);
    RUN_TEST(suite, "remaining observer keeps receiving",
             stay.NotificationCount() == 2);
    RUN_TEST(suite, "remover remains subscribed",
             remover.NotificationCount() == 2);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void Test_RemoveAllObserversDuringBroadcast()
{
    INIT_SUITE(suite, "Remove all observers during broadcast");
    BEGIN_SUITE(suite);

    DataModel model;
    ViewWindow view1;
    ViewWindow view2;
    ControlWindow control;

    control.SetOnEventAction([&model, &view1, &view2, &control]() {
        model.Unsubscribe(view1.GetCallback());
        model.Unsubscribe(view2.GetCallback());
        model.Unsubscribe(control.GetCallback());
    });

    model.Subscribe(view1.GetCallback());
    model.Subscribe(view2.GetCallback());
    model.Subscribe(control.GetCallback());

    model.Broadcast(1);
    const int view1_after_first = view1.NotificationCount();
    const int view2_after_first = view2.NotificationCount();
    const int control_after_first = control.NotificationCount();
    model.Broadcast(2);

    RUN_TEST(suite, "view1 does not receive second event",
             view1.NotificationCount() == view1_after_first);
    RUN_TEST(suite, "view2 does not receive second event",
             view2.NotificationCount() == view2_after_first);
    RUN_TEST(suite, "control does not receive second event",
             control.NotificationCount() == control_after_first);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void Test_AddObserverDuringBroadcast()
{
    INIT_SUITE(suite, "Add observer during broadcast");
    BEGIN_SUITE(suite);

    DataModel model;
    ViewWindow existing;
    ViewWindow added;
    ControlWindow adder;

    adder.SetOnEventAction([&model, &added]() { model.Subscribe(added.GetCallback()); });

    model.Subscribe(existing.GetCallback());
    model.Subscribe(adder.GetCallback());

    model.Broadcast(1);
    RUN_TEST(suite, "added observer not called in same broadcast",
             added.NotificationCount() == 0);

    model.Broadcast(2);
    RUN_TEST(suite, "added observer called next broadcast",
             added.NotificationCount() == 1);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void Test_AddTwoObserversDuringBroadcast()
{
    INIT_SUITE(suite, "Add two observers during broadcast");
    BEGIN_SUITE(suite);

    DataModel model;
    ViewWindow added1;
    ViewWindow added2;
    ControlWindow adder;

    adder.SetOnEventAction([&model, &added1, &added2]() {
        model.Subscribe(added1.GetCallback());
        model.Subscribe(added2.GetCallback());
    });

    model.Subscribe(adder.GetCallback());
    model.Broadcast(1);

    RUN_TEST(suite, "added1 not called in same broadcast",
             added1.NotificationCount() == 0);
    RUN_TEST(suite, "added2 not called in same broadcast",
             added2.NotificationCount() == 0);

    model.Broadcast(2);

    RUN_TEST(suite, "added1 called on next broadcast",
             added1.NotificationCount() == 1);
    RUN_TEST(suite, "added2 called on next broadcast",
             added2.NotificationCount() == 1);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void Test_PublisherDeathNotifiesSubscribers()
{
    INIT_SUITE(suite, "Publisher death notifies subscribers");
    BEGIN_SUITE(suite);

    ViewWindow view;
    ControlWindow control;

    {
        DataModel model;
        model.Subscribe(view.GetCallback());
        model.Subscribe(control.GetCallback());
    }

    RUN_TEST(suite, "view was notified on publisher death", view.DeathNotified());
    RUN_TEST(suite, "control was notified on publisher death",
             control.DeathNotified());

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void Test_SubscriberDeathAutoUnsubscribe()
{
    INIT_SUITE(suite, "Subscriber death auto unsubscribe");
    BEGIN_SUITE(suite);

    DataModel model;
    ViewWindow survivor;

    model.Subscribe(survivor.GetCallback());

    {
        ViewWindow temp;
        model.Subscribe(temp.GetCallback());
    }

    model.Broadcast(42);
    RUN_TEST(suite, "survivor still receives events",
             survivor.NotificationCount() == 1);

    END_SUITE(suite);
    PRINT_SUITE_SUMMARY(suite);
}

void RegisterTests()
{
    REGISTER_TEST(Test_BroadcastToOneObserver);
    REGISTER_TEST(Test_BroadcastToTwoObservers);
    REGISTER_TEST(Test_BroadcastToThreeObservers);
    REGISTER_TEST(Test_RemoveOneObserverDuringBroadcast);
    REGISTER_TEST(Test_RemoveAllObserversDuringBroadcast);
    REGISTER_TEST(Test_AddObserverDuringBroadcast);
    REGISTER_TEST(Test_AddTwoObserversDuringBroadcast);
    REGISTER_TEST(Test_PublisherDeathNotifiesSubscribers);
    REGISTER_TEST(Test_SubscriberDeathAutoUnsubscribe);
}

} // namespace

int main()
{
    PRINT_TEST_HEADER("Dispatcher");
    RegisterTests();

    for (int i = 0; i < TestUtils::GetRegisteredTestCount(); ++i)
    {
        TestUtils::RunRegisteredTest(i);
    }

    PRINT_SUMMARY();
    return (TestUtils::GetPassedTests() == TestUtils::GetTotalTests()) ? 0 : 1;
}
