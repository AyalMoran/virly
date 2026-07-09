import { Pencil, RotateCcw } from "lucide-react";

/**
 * Hook-free action row under a user chat bubble. The widget owns the actual
 * resend/edit behavior; this component only renders accessible controls, so it
 * stays unit-testable in the static-markup harness.
 */
export function ChatMessageActions({
  disabled,
  onResend,
  onEdit,
}: {
  disabled: boolean;
  onResend: () => void;
  onEdit: () => void;
}) {
  const buttonClass =
    "flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground " +
    "hover:bg-background/50 hover:text-foreground" +
    (disabled ? " pointer-events-none opacity-40" : "");

  return (
    <div className="flex gap-1">
      <button
        type="button"
        className={buttonClass}
        aria-label="Resend this message"
        disabled={disabled}
        onClick={onResend}
      >
        <RotateCcw className="h-3 w-3" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={buttonClass}
        aria-label="Edit and resend this message"
        disabled={disabled}
        onClick={onEdit}
      >
        <Pencil className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  );
}
