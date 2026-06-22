import React, {
  type ButtonHTMLAttributes,
  type ChangeEventHandler,
  type InputHTMLAttributes,
  type ReactNode
} from "react";
import { Inbox } from "lucide-react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

export function Button({
  className = "",
  variant = "primary",
  ...props
}: ButtonProps) {
  return <button className={`button button-${variant} ${className}`} {...props} />;
}

export function Card({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function PageStack({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`page-stack ${className}`.trim()}>{children}</div>;
}

export function ResponsiveGrid({
  children,
  className = "",
  variant = "sidebar"
}: {
  children: ReactNode;
  className?: string;
  variant?: "sidebar" | "dashboard" | "split" | "filters";
}) {
  return (
    <div className={`responsive-grid responsive-grid-${variant} ${className}`.trim()}>
      {children}
    </div>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export function Field({ label, error, hint, id, ...props }: FieldProps) {
  const inputId = id ?? props.name;

  return (
    <label className="field" htmlFor={inputId}>
      <span className="field-label">{label}</span>
      <input id={inputId} aria-invalid={Boolean(error)} {...props} />
      {hint && !error ? <span className="field-hint">{hint}</span> : null}
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}

export function TextareaField({
  label,
  error,
  hint,
  id,
  name,
  value,
  onChange,
  maxLength
}: {
  label: string;
  error?: string;
  hint?: string;
  id?: string;
  name: string;
  value: string;
  onChange: ChangeEventHandler<HTMLTextAreaElement>;
  maxLength?: number;
}) {
  const inputId = id ?? name;

  return (
    <label className="field" htmlFor={inputId}>
      <span className="field-label">{label}</span>
      <textarea
        id={inputId}
        name={name}
        value={value}
        onChange={onChange}
        maxLength={maxLength}
        aria-invalid={Boolean(error)}
      />
      {hint && !error ? <span className="field-hint">{hint}</span> : null}
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}

export function PageHeader({
  eyebrow,
  title,
  children
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div className="page-header-copy">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
      </div>
      {children ? <div className="page-header-actions">{children}</div> : null}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="banner banner-error" role="alert">
      {message}
    </div>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="banner banner-success" role="status">
      {message}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  icon,
  children
}: {
  title: string;
  message: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-flourish" aria-hidden="true" />
      <div className="empty-seal" aria-hidden="true">
        <span className="empty-seal-ring" />
        <span className="empty-seal-icon">{icon ?? <Inbox />}</span>
      </div>
      <h2>{title}</h2>
      {message ? <p>{message}</p> : null}
      <div className="empty-ledger" aria-hidden="true">
        <span className="empty-ledger-row">
          <span className="empty-ledger-key" />
          <span className="empty-ledger-dots" />
          <span className="empty-ledger-val" />
        </span>
        <span className="empty-ledger-row">
          <span className="empty-ledger-key" />
          <span className="empty-ledger-dots" />
          <span className="empty-ledger-val" />
        </span>
      </div>
      {children ? <div className="empty-state-actions">{children}</div> : null}
    </div>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="printing" role="status" aria-busy="true" aria-label="Loading">
      <span className="printing-slot" aria-hidden="true" />
      <div className="printing-lines" aria-hidden="true">
        {Array.from({ length: rows }).map((_, index) => (
          <span className="printing-line" key={index} />
        ))}
      </div>
      <span className="printing-caption" aria-hidden="true">
        Printing…
      </span>
    </div>
  );
}
