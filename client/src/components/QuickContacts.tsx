import { UserRound } from "lucide-react";
import { Link } from "react-router-dom";
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
        <div className="quick-contact-row" key={contact.email}>
          <button
            className="quick-contact"
            type="button"
            onClick={() => onSelectContact(contact.email)}
          >
            <span className="quick-contact-avatar" aria-hidden="true">
              {contact.avatar}
            </span>
            <span className="quick-contact-email">{contact.email}</span>
          </button>
          <Link
            className="quick-contact-profile-link"
            to={`/users/${encodeURIComponent(contact.email)}`}
            aria-label={`View ${contact.email}'s profile`}
            title="View profile"
          >
            <UserRound aria-hidden="true" />
          </Link>
        </div>
      ))}
    </div>
  );
}
