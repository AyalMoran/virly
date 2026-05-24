import type { QuickContact } from "../lib/contacts";

export function QuickContacts({
  contacts,
  onSelectContact
}: {
  contacts: QuickContact[];
  onSelectContact: (email: string) => void;
}) {
  if (!contacts.length) {
    return <div className="quick-contact-empty">No contacts</div>;
  }

  return (
    <div className="quick-contact-list">
      {contacts.map((contact) => (
        <button
          className="quick-contact"
          key={contact.email}
          type="button"
          onClick={() => onSelectContact(contact.email)}
        >
          <span className="quick-contact-avatar" aria-hidden="true">
            {contact.avatar}
          </span>
          <span className="quick-contact-email">{contact.email}</span>
        </button>
      ))}
    </div>
  );
}
