import { Star, X } from "lucide-react";
import type { RecipientBookEntry } from "../../lib/contacts";

function ChipRow({
  entry,
  selected,
  disabled,
  onSelect,
  action
}: {
  entry: RecipientBookEntry;
  selected: boolean;
  disabled?: boolean;
  onSelect: (email: string) => void;
  action: { label: string; icon: JSX.Element; onClick: () => void };
}) {
  return (
    <div className="payee-chip-row">
      <button
        type="button"
        className={selected ? "cheque-payee-chip selected" : "cheque-payee-chip"}
        disabled={disabled}
        onClick={() => onSelect(entry.email)}
      >
        <span aria-hidden="true">{entry.avatar}</span>
        <strong>{entry.displayName?.trim() || entry.email}</strong>
      </button>
      <button
        type="button"
        className="payee-chip-action"
        aria-label={action.label}
        disabled={disabled}
        onClick={action.onClick}
      >
        {action.icon}
      </button>
    </div>
  );
}

export function RecipientBook({
  saved,
  recent,
  selectedEmail,
  disabled,
  onSelect,
  onSave,
  onRemove
}: {
  saved: RecipientBookEntry[];
  recent: RecipientBookEntry[];
  selectedEmail: string;
  disabled?: boolean;
  onSelect: (email: string) => void;
  onSave: (email: string) => void;
  onRemove: (contactId: string) => void;
}) {
  if (!saved.length && !recent.length) {
    return null;
  }

  return (
    <div className="cheque-payeebook" aria-label="Recipient book">
      {saved.length ? (
        <>
          <span className="cheque-microlabel">Saved contacts</span>
          <div className="cheque-payeebook-grid">
            {saved.map((entry) => (
              <ChipRow
                key={entry.email}
                entry={entry}
                selected={selectedEmail === entry.email}
                disabled={disabled}
                onSelect={onSelect}
                action={{
                  label: `Remove ${entry.displayName?.trim() || entry.email} from contacts`,
                  icon: <X aria-hidden="true" />,
                  onClick: () => entry.contactId && onRemove(entry.contactId)
                }}
              />
            ))}
          </div>
        </>
      ) : null}
      {recent.length ? (
        <>
          <span className="cheque-microlabel">Recent payees</span>
          <div className="cheque-payeebook-grid">
            {recent.map((entry) => (
              <ChipRow
                key={entry.email}
                entry={entry}
                selected={selectedEmail === entry.email}
                disabled={disabled}
                onSelect={onSelect}
                action={{
                  label: `Save ${entry.email} as a contact`,
                  icon: <Star aria-hidden="true" />,
                  onClick: () => onSave(entry.email)
                }}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
