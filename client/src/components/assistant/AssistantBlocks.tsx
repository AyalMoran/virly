import React, { type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  Check,
  Clock,
  Info,
  ReceiptText,
  ShieldCheck,
  Video,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";

import { formatDate, formatMoneyILS } from "../../lib/format";
import type {
  AiTransferConfirmation,
  AssistantKeyValueItem,
  AssistantMoneyValue,
  AssistantResponseBlock,
  AssistantTransactionItem,
  LocalizedText,
  PendingTransferItem,
} from "../../lib/types";
import { cn } from "../../lib/utils";

export type TransferConfirmationCardStatus =
  | "pending"
  | "confirming"
  | "denying"
  | "confirmed"
  | "denied"
  | "superseded"
  | "failed";

type AssistantBlocksProps = {
  blocks: AssistantResponseBlock[];
  locale?: string;
  confirmationStatus?: TransferConfirmationCardStatus;
  onConfirmTransfer?: (confirmation: AiTransferConfirmation) => void;
  onDenyTransfer?: (confirmation: AiTransferConfirmation) => void;
};

type AssistantCardProps = {
  title?: LocalizedText;
  subtitle?: LocalizedText;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
};

function getPreferredLocale(locale?: string) {
  if (locale) {
    return locale;
  }

  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language;
  }

  return "he-IL";
}

function textDirection(value?: LocalizedText | string) {
  if (!value) {
    return "auto";
  }

  if (typeof value !== "string" && value.dir) {
    return value.dir;
  }

  const text = typeof value === "string" ? value : value.text;
  return /[\u0590-\u05ff]/.test(text) ? "rtl" : "auto";
}

function localizedText(value?: LocalizedText) {
  return value?.text ?? "";
}

function isMoneyValue(value: AssistantKeyValueItem["value"]): value is AssistantMoneyValue {
  return "amount" in value && "currency" in value;
}

function splitEmail(value: string) {
  const email = value.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0];
  const label = value
    .replace(/\s*\([^)]*@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\)\s*/g, " ")
    .replace(email ?? "", "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    label: label || value,
    email
  };
}

function formatMoney(value: AssistantMoneyValue, locale?: string) {
  if (value.formatted) {
    return value.formatted;
  }

  const resolvedLocale = getPreferredLocale(locale);
  if (value.currency === "ILS") {
    return formatMoneyILS(value.amount, resolvedLocale);
  }

  return new Intl.NumberFormat(resolvedLocale, {
    style: "currency",
    currency: value.currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value.amount);
}

export function MoneyValue({
  value,
  locale,
  className,
}: {
  value: AssistantMoneyValue;
  locale?: string;
  className?: string;
}) {
  return (
    <bdi
      dir="ltr"
      className={cn("inline-block whitespace-nowrap font-semibold", className)}
    >
      {formatMoney(value, locale)}
    </bdi>
  );
}

export function DateTimeValue({
  value,
  locale,
  className,
}: {
  value?: string;
  locale?: string;
  className?: string;
}) {
  return (
    <bdi dir="ltr" className={cn("inline-block whitespace-nowrap", className)}>
      {formatDate(value, getPreferredLocale(locale))}
    </bdi>
  );
}

export function CounterpartyValue({
  name,
  email,
  className,
}: {
  name: string;
  email?: string;
  className?: string;
}) {
  const parts = splitEmail(email ? `${name} (${email})` : name);

  return (
    <span
      className={cn("grid min-w-0 gap-0.5 text-start [overflow-wrap:anywhere]", className)}
      dir="auto"
      style={{ textAlign: "start", overflowWrap: "anywhere" }}
    >
      <span dir="auto" className="min-w-0 break-words font-medium leading-4">
        {parts.label}
      </span>
      {parts.email ? (
        <bdi
          dir="ltr"
          className="min-w-0 break-all text-[11px] leading-4 text-muted-foreground"
        >
          {parts.email}
        </bdi>
      ) : null}
    </span>
  );
}

export function StatusBadge({
  status,
  className,
}: {
  status?: string;
  className?: string;
}) {
  if (!status) {
    return null;
  }

  const normalized = status.toLowerCase();
  const tone =
    normalized === "completed" || normalized === "confirmed" || normalized === "eligible"
      ? "success"
      : normalized === "pending"
        ? "warning"
        : normalized === "failed" ||
            normalized === "denied" ||
            normalized === "cancelled" ||
            normalized === "canceled" ||
            normalized === "not eligible"
          ? "danger"
          : "neutral";

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize leading-4",
        tone === "success" &&
          "border-emerald-500/25 bg-emerald-500/10 text-emerald-700",
        tone === "warning" &&
          "border-amber-500/25 bg-amber-500/10 text-amber-700",
        tone === "danger" && "border-red-500/25 bg-red-500/10 text-red-700",
        tone === "neutral" &&
          "border-border/40 bg-background/70 text-muted-foreground",
        className,
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function AssistantCard({
  title,
  subtitle,
  icon,
  children,
  className,
}: AssistantCardProps) {
  const dir = textDirection(title ?? subtitle);

  return (
    <article
      dir={dir}
      className={cn(
        "overflow-hidden rounded-lg border border-border/30 bg-background/90 shadow-sm ring-1 ring-white/30",
        className,
      )}
      style={{ textAlign: "start", overflowWrap: "anywhere" }}
    >
      {title || subtitle ? (
        <header className="flex min-w-0 items-start gap-2 border-b border-border/30 bg-muted/30 px-3 py-2.5">
          {icon ? (
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              {icon}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            {title ? (
              <h4
                dir={title.dir ?? "auto"}
                className="break-words text-[13px] font-semibold leading-5 text-foreground"
              >
                {title.text}
              </h4>
            ) : null}
            {subtitle ? (
              <p
                dir={subtitle.dir ?? "auto"}
                className="break-words text-[11px] leading-4 text-muted-foreground"
              >
                {subtitle.text}
              </p>
            ) : null}
          </div>
        </header>
      ) : null}
      {children}
    </article>
  );
}

function KeyValueValue({
  value,
  locale,
}: {
  value: AssistantKeyValueItem["value"];
  locale?: string;
}) {
  if (isMoneyValue(value)) {
    return <MoneyValue value={value} locale={locale} />;
  }

  return (
    <span dir={value.dir ?? "auto"} className="break-words font-medium text-foreground">
      {value.text}
    </span>
  );
}

export function KeyValueGrid({
  items,
  locale,
}: {
  items: AssistantKeyValueItem[];
  locale?: string;
}) {
  return (
    <dl className="grid gap-1.5 p-3 text-[12px]">
      {items.map((item, index) => (
        <div
          key={`${item.label.text}-${index}`}
          className="grid min-w-0 grid-cols-[minmax(5.75rem,0.85fr)_minmax(0,1fr)] items-start gap-2 rounded-md border border-border/25 bg-background/60 px-2.5 py-2 sm:grid-cols-[minmax(6.5rem,0.8fr)_minmax(0,1fr)]"
          style={{ textAlign: "start", overflowWrap: "anywhere" }}
        >
          <dt
            dir={item.label.dir ?? "auto"}
            className="min-w-0 break-words text-muted-foreground"
          >
            {item.label.text}
          </dt>
          <dd className="min-w-0 text-start">
            <KeyValueValue value={item.value} locale={locale} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function TransactionRow({
  transaction,
  locale,
}: {
  transaction: AssistantTransactionItem;
  locale?: string;
}) {
  const Icon = transaction.direction === "sent" ? ArrowUpRight : ArrowDownLeft;

  return (
    <li className="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] gap-2 border-t border-border/25 px-3 py-2.5 first:border-t-0">
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 items-center justify-center rounded-full",
          transaction.direction === "sent"
            ? "bg-red-500/10 text-red-600"
            : "bg-emerald-500/10 text-emerald-700",
        )}
        aria-hidden="true"
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="grid min-w-0 gap-1">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <CounterpartyValue
            name={transaction.counterpartyName}
            email={transaction.counterpartyEmail}
          />
          <MoneyValue
            value={transaction.amount}
            locale={locale}
            className={transaction.direction === "sent" ? "text-red-700" : "text-emerald-700"}
          />
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-4 text-muted-foreground">
          <DateTimeValue value={transaction.createdAt} locale={locale} />
          <StatusBadge status={transaction.status} />
          {transaction.description ? (
            <span dir="auto" className="min-w-0 break-words">
              {transaction.description}
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function TransactionListCard({
  block,
  locale,
}: {
  block: Extract<AssistantResponseBlock, { type: "transaction_list" }>;
  locale?: string;
}) {
  return (
    <AssistantCard
      title={block.title}
      subtitle={block.subtitle}
      icon={<ReceiptText className="h-3.5 w-3.5" />}
    >
      <ul className="grid min-w-0">
        {block.transactions.map((transaction) => (
          <TransactionRow
            key={transaction.id}
            transaction={transaction}
            locale={locale}
          />
        ))}
      </ul>
    </AssistantCard>
  );
}

export function AccountSummaryCard({
  block,
  locale,
}: {
  block: Extract<AssistantResponseBlock, { type: "account_summary" }>;
  locale?: string;
}) {
  const items = block.items ?? [
    {
      label: { text: "Available balance", dir: "auto" as const },
      value: block.availableBalance,
    },
  ];

  return (
    <AssistantCard
      title={block.title}
      subtitle={block.accountLabel}
      icon={<Wallet className="h-3.5 w-3.5" />}
    >
      <KeyValueGrid items={items} locale={locale} />
    </AssistantCard>
  );
}

export function PendingTransferCard({
  pendingTransfer,
  locale,
}: {
  pendingTransfer: PendingTransferItem;
  locale?: string;
}) {
  const recipient = splitEmail(pendingTransfer.recipientLabel);

  return (
    <article
      className="grid min-w-0 gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3"
      dir="auto"
      style={{ textAlign: "start", overflowWrap: "anywhere" }}
    >
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <CounterpartyValue
          name={recipient.label}
          email={recipient.email ?? pendingTransfer.recipientEmailMasked}
        />
        <MoneyValue value={pendingTransfer.amount} locale={locale} />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <StatusBadge status={pendingTransfer.status} />
        <Clock className="h-3 w-3 shrink-0" />
        <DateTimeValue value={pendingTransfer.expiresAt} locale={locale} />
        {pendingTransfer.reason ? (
          <span dir="auto" className="min-w-0 break-words">
            {pendingTransfer.reason}
          </span>
        ) : null}
      </div>
    </article>
  );
}

function PendingTransfersCard({
  block,
  locale,
}: {
  block: Extract<AssistantResponseBlock, { type: "pending_transfers" }>;
  locale?: string;
}) {
  return (
    <section className="grid gap-2">
      <div
        dir={textDirection(block.title)}
        className="px-0.5 text-[12px] font-semibold text-foreground"
        style={{ textAlign: "start" }}
      >
        {localizedText(block.title)}
      </div>
      {block.pendingTransfers.map((pendingTransfer) => (
        <PendingTransferCard
          key={pendingTransfer.id}
          pendingTransfer={pendingTransfer}
          locale={locale}
        />
      ))}
    </section>
  );
}

function TransactionDetailCard({
  block,
  locale,
}: {
  block: Extract<AssistantResponseBlock, { type: "transaction_detail" }>;
  locale?: string;
}) {
  const items: AssistantKeyValueItem[] = [
    {
      label: { text: "Amount", dir: "auto" },
      value: block.transaction.amount,
    },
    {
      label: { text: "Counterparty", dir: "auto" },
      value: {
        text: block.transaction.counterpartyEmail
          ? `${block.transaction.counterpartyName} (${block.transaction.counterpartyEmail})`
          : block.transaction.counterpartyName,
        dir: "auto",
      },
    },
    {
      label: { text: "Status", dir: "auto" },
      value: { text: block.transaction.status ?? "completed", dir: "auto" },
    },
    {
      label: { text: "Date", dir: "auto" },
      value: { text: formatDate(block.transaction.createdAt, getPreferredLocale(locale)), dir: "ltr" },
    },
  ];

  return (
    <AssistantCard
      title={block.title}
      icon={<ReceiptText className="h-3.5 w-3.5" />}
    >
      <KeyValueGrid items={items} locale={locale} />
    </AssistantCard>
  );
}

function TransactionStatsCard({
  block,
  locale,
}: {
  block: Extract<AssistantResponseBlock, { type: "transaction_stats" }>;
  locale?: string;
}) {
  const items = block.items ?? [
    {
      label: { text: "Transaction count", dir: "auto" as const },
      value: { text: String(block.count), dir: "ltr" as const },
    },
    ...(block.sentTotal
      ? [{ label: { text: "Total sent", dir: "auto" as const }, value: block.sentTotal }]
      : []),
    ...(block.receivedTotal
      ? [
          {
            label: { text: "Total received", dir: "auto" as const },
            value: block.receivedTotal,
          },
        ]
      : []),
    ...(block.net
      ? [{ label: { text: "Net", dir: "auto" as const }, value: block.net }]
      : []),
  ];

  return (
    <AssistantCard
      title={block.title}
      icon={<ReceiptText className="h-3.5 w-3.5" />}
    >
      <KeyValueGrid items={items} locale={locale} />
    </AssistantCard>
  );
}

function TransferQuoteCard({
  block,
  locale,
}: {
  block: Extract<AssistantResponseBlock, { type: "transfer_quote" }>;
  locale?: string;
}) {
  const items: AssistantKeyValueItem[] = [
    ...(block.recipientLabel
      ? [
          {
            label: { text: "Recipient", dir: "auto" as const },
            value: { text: block.recipientLabel, dir: "auto" as const },
          },
        ]
      : []),
    ...(block.amount
      ? [{ label: { text: "Amount", dir: "auto" as const }, value: block.amount }]
      : []),
    ...(block.currentBalance
      ? [
          {
            label: { text: "Current balance", dir: "auto" as const },
            value: block.currentBalance,
          },
        ]
      : []),
    ...(block.remainingBalanceAfterTransfer
      ? [
          {
            label: { text: "After transfer", dir: "auto" as const },
            value: block.remainingBalanceAfterTransfer,
          },
        ]
      : []),
    ...(block.dailyRemaining
      ? [
          {
            label: { text: "Daily remaining", dir: "auto" as const },
            value: block.dailyRemaining,
          },
        ]
      : []),
  ];

  return (
    <AssistantCard
      title={block.title}
      subtitle={{ text: block.eligible ? "Eligible" : "Not eligible", dir: "auto" }}
      icon={<ShieldCheck className="h-3.5 w-3.5" />}
    >
      <KeyValueGrid items={items} locale={locale} />
      {block.warnings?.length ? (
        <div className="grid gap-1 border-t border-border/25 p-3 pt-2">
          {block.warnings.map((warning) => (
            <p
              key={warning}
              dir="auto"
              className="flex min-w-0 gap-1.5 text-[11px] leading-4 text-amber-800"
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="min-w-0 break-words">{warning}</span>
            </p>
          ))}
        </div>
      ) : null}
    </AssistantCard>
  );
}

function TransferStatusCard({
  block,
  locale,
}: {
  block: Extract<AssistantResponseBlock, { type: "transfer_status" }>;
  locale?: string;
}) {
  const items: AssistantKeyValueItem[] = [
    {
      label: { text: "Status", dir: "auto" },
      value: { text: block.status, dir: "auto" },
    },
    ...(block.recipientLabel
      ? [
          {
            label: { text: "Recipient", dir: "auto" as const },
            value: { text: block.recipientLabel, dir: "auto" as const },
          },
        ]
      : []),
    ...(block.amount
      ? [{ label: { text: "Amount", dir: "auto" as const }, value: block.amount }]
      : []),
    ...(block.reason
      ? [
          {
            label: { text: "Reason", dir: "auto" as const },
            value: { text: block.reason, dir: "auto" as const },
          },
        ]
      : []),
    ...(block.expiresAt
      ? [
          {
            label: { text: "Expires", dir: "auto" as const },
            value: {
              text: formatDate(block.expiresAt, getPreferredLocale(locale)),
              dir: "ltr" as const,
            },
          },
        ]
      : []),
  ];

  return (
    <AssistantCard
      title={block.title}
      subtitle={{ text: block.status, dir: "auto" }}
      icon={<Clock className="h-3.5 w-3.5" />}
    >
      <KeyValueGrid items={items} locale={locale} />
      {block.message ? (
        <p
          dir={block.message.dir ?? "auto"}
          className="border-t border-border/25 p-3 text-[12px] leading-5 text-muted-foreground"
        >
          {block.message.text}
        </p>
      ) : null}
    </AssistantCard>
  );
}

function TransferLimitsCard({
  block,
  locale,
}: {
  block: Extract<AssistantResponseBlock, { type: "transfer_limits" }>;
  locale?: string;
}) {
  const items: AssistantKeyValueItem[] = [
    ...(block.eligible !== undefined
      ? [
          {
            label: { text: "Eligibility", dir: "auto" as const },
            value: {
              text: block.eligible ? "Eligible" : "Not eligible",
              dir: "auto" as const,
            },
          },
        ]
      : []),
    ...(block.amount
      ? [{ label: { text: "Amount checked", dir: "auto" as const }, value: block.amount }]
      : []),
    ...(block.balance
      ? [{ label: { text: "Balance", dir: "auto" as const }, value: block.balance }]
      : []),
    ...(block.maxSendableNow
      ? [
          {
            label: { text: "Max now", dir: "auto" as const },
            value: block.maxSendableNow,
          },
        ]
      : []),
    ...(block.perTransferLimit
      ? [
          {
            label: { text: "Per transfer", dir: "auto" as const },
            value: block.perTransferLimit,
          },
        ]
      : []),
    ...(block.dailyTransferLimit
      ? [
          {
            label: { text: "Daily limit", dir: "auto" as const },
            value: block.dailyTransferLimit,
          },
        ]
      : []),
    ...(block.dailyUsed
      ? [{ label: { text: "Used today", dir: "auto" as const }, value: block.dailyUsed }]
      : []),
    ...(block.dailyRemaining
      ? [
          {
            label: { text: "Daily remaining", dir: "auto" as const },
            value: block.dailyRemaining,
          },
        ]
      : []),
    ...(block.transferCountToday !== undefined
      ? [
          {
            label: { text: "Transfers today", dir: "auto" as const },
            value: { text: String(block.transferCountToday), dir: "ltr" as const },
          },
        ]
      : []),
    ...(block.resetAt
      ? [
          {
            label: { text: "Resets", dir: "auto" as const },
            value: {
              text: formatDate(block.resetAt, getPreferredLocale(locale)),
              dir: "ltr" as const,
            },
          },
        ]
      : []),
  ];

  return (
    <AssistantCard
      title={block.title}
      subtitle={
        block.eligible === undefined
          ? undefined
          : { text: block.eligible ? "Eligible" : "Not eligible", dir: "auto" }
      }
      icon={<ShieldCheck className="h-3.5 w-3.5" />}
    >
      <KeyValueGrid items={items} locale={locale} />
      {block.reasons?.length ? (
        <div className="grid gap-1 border-t border-border/25 p-3 pt-2">
          {block.reasons.map((reason) => (
            <p
              key={reason}
              dir="auto"
              className="flex min-w-0 gap-1.5 text-[11px] leading-4 text-amber-800"
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="min-w-0 break-words">{reason}</span>
            </p>
          ))}
        </div>
      ) : null}
    </AssistantCard>
  );
}

function getRecipientName(confirmation: AiTransferConfirmation) {
  return confirmation.recipient?.displayName || [
    confirmation.recipientFirstName,
    confirmation.recipientLastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim() || confirmation.recipientEmail;
}

function isConfirmationExpired(confirmation: AiTransferConfirmation) {
  return new Date(confirmation.expiresAt).getTime() <= Date.now();
}

function getConfirmationStatusLabel(
  status: TransferConfirmationCardStatus | undefined,
  confirmation: AiTransferConfirmation,
) {
  if (isConfirmationExpired(confirmation)) {
    return "Expired";
  }

  switch (status) {
    case "confirming":
      return "Sending";
    case "denying":
      return "Cancelling";
    case "confirmed":
      return "Confirmed";
    case "denied":
      return "Denied";
    case "superseded":
      return "Replaced";
    case "failed":
      return "Needs retry";
    default:
      return "Pending";
  }
}

function TransferConfirmationCard({
  block,
  locale,
  status,
  onConfirm,
  onDeny,
}: {
  block: Extract<AssistantResponseBlock, { type: "transfer_confirmation" }>;
  locale?: string;
  status?: TransferConfirmationCardStatus;
  onConfirm?: (confirmation: AiTransferConfirmation) => void;
  onDeny?: (confirmation: AiTransferConfirmation) => void;
}) {
  const confirmation = block.confirmation;
  const expired = isConfirmationExpired(confirmation);
  const disabled = (status ?? "pending") !== "pending" || expired;

  return (
    <AssistantCard
      title={block.title}
      subtitle={{ text: getConfirmationStatusLabel(status, confirmation), dir: "auto" }}
      icon={<ShieldCheck className="h-3.5 w-3.5" />}
      className="border-emerald-500/25"
    >
      <KeyValueGrid
        locale={locale}
        items={[
          {
            label: { text: "Recipient", dir: "auto" },
            value: {
              text: `${getRecipientName(confirmation)} (${confirmation.recipientEmail})`,
              dir: "auto",
            },
          },
          {
            label: { text: "Amount", dir: "auto" },
            value: {
              amount: confirmation.amountDetails?.value ?? confirmation.amount,
              currency: confirmation.currency,
              formatted: confirmation.amountDetails?.formatted,
            },
          },
          {
            label: { text: "Reason", dir: "auto" },
            value: { text: confirmation.reason || "Not provided", dir: "auto" },
          },
          {
            label: { text: "Expires", dir: "auto" },
            value: {
              text: formatDate(confirmation.expiresAt, getPreferredLocale(locale)),
              dir: "ltr",
            },
          },
        ]}
      />
      {confirmation.warnings?.length ? (
        <div className="grid gap-1 border-t border-border/25 p-3 pt-2">
          {confirmation.warnings.map((warning) => (
            <p
              key={`${warning.code}-${warning.message}`}
              dir="auto"
              className="flex min-w-0 gap-1.5 text-[11px] leading-4 text-amber-800"
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="min-w-0 break-words">{warning.message}</span>
            </p>
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2 border-t border-border/25 p-3 pt-2">
        <button
          type="button"
          className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-emerald-600 px-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:pointer-events-none disabled:opacity-50"
          disabled={disabled || !onConfirm}
          onClick={() => onConfirm?.(confirmation)}
        >
          <Check className="h-3.5 w-3.5" />
          {status === "confirming" ? "Sending" : "Confirm"}
        </button>
        <button
          type="button"
          className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-red-600 px-2 text-xs font-medium text-white hover:bg-red-700 disabled:pointer-events-none disabled:opacity-50"
          disabled={disabled || !onDeny}
          onClick={() => onDeny?.(confirmation)}
        >
          <Ban className="h-3.5 w-3.5" />
          {status === "denying" ? "Cancelling" : "Deny"}
        </button>
      </div>
    </AssistantCard>
  );
}

export function EmptyStateCard({
  block,
}: {
  block: Extract<AssistantResponseBlock, { type: "empty_state" }>;
}) {
  return (
    <AssistantCard title={block.title} icon={<Info className="h-3.5 w-3.5" />}>
      <p
        dir={block.message.dir ?? "auto"}
        className="min-w-0 break-words p-3 text-[12px] leading-5 text-muted-foreground"
      >
        {block.message.text}
      </p>
    </AssistantCard>
  );
}

export function NoticeCard({
  block,
}: {
  block: Extract<AssistantResponseBlock, { type: "notice" }>;
}) {
  const Icon = block.tone === "warning" || block.tone === "error"
    ? AlertTriangle
    : Info;

  return (
    <AssistantCard
      title={block.title}
      icon={<Icon className="h-3.5 w-3.5" />}
      className={cn(
        block.tone === "warning" && "border-amber-500/25",
        block.tone === "error" && "border-red-500/25",
        block.tone === "success" && "border-emerald-500/25",
      )}
    >
      <p
        dir={block.message.dir ?? "auto"}
        className="min-w-0 break-words p-3 text-[12px] leading-5 text-muted-foreground"
      >
        {block.message.text}
      </p>
    </AssistantCard>
  );
}

export function VideoSessionCtaCard({
  block,
}: {
  block: Extract<AssistantResponseBlock, { type: "video_session_cta" }>;
}) {
  return (
    <AssistantCard
      title={block.title}
      icon={<Video className="h-3.5 w-3.5" />}
      className="border-emerald-500/25"
    >
      <div className="grid gap-2.5 p-3 text-[12px] leading-5">
        {block.message ? (
          <p
            dir={block.message.dir ?? "auto"}
            className="min-w-0 break-words text-muted-foreground"
          >
            {block.message.text}
          </p>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold capitalize text-emerald-700">
            {block.sessionType}
          </span>
          <span className="rounded-full border border-border/40 bg-background/70 px-2 py-0.5 text-[10px] font-semibold capitalize text-muted-foreground">
            {block.status.replace(/_/g, " ")}
          </span>
        </div>
        <Link
          to={block.appPath}
          dir={block.ctaLabel.dir ?? "auto"}
          className="inline-flex min-h-9 items-center justify-center rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground"
        >
          {block.ctaLabel.text}
        </Link>
      </div>
    </AssistantCard>
  );
}

function renderBlock(
  block: AssistantResponseBlock,
  props: Omit<AssistantBlocksProps, "blocks">,
) {
  switch (block.type) {
    case "text":
      return (
        <AssistantCard title={block.title}>
          <p
            dir={block.text.dir ?? "auto"}
            className="min-w-0 break-words p-3 text-[12px] leading-5"
          >
            {block.text.text}
          </p>
        </AssistantCard>
      );
    case "account_summary":
      return <AccountSummaryCard block={block} locale={props.locale} />;
    case "transaction_list":
      return <TransactionListCard block={block} locale={props.locale} />;
    case "transaction_detail":
      return <TransactionDetailCard block={block} locale={props.locale} />;
    case "transaction_stats":
      return <TransactionStatsCard block={block} locale={props.locale} />;
    case "pending_transfers":
      return <PendingTransfersCard block={block} locale={props.locale} />;
    case "transfer_quote":
      return <TransferQuoteCard block={block} locale={props.locale} />;
    case "transfer_status":
      return <TransferStatusCard block={block} locale={props.locale} />;
    case "transfer_limits":
      return <TransferLimitsCard block={block} locale={props.locale} />;
    case "transfer_confirmation":
      return (
        <TransferConfirmationCard
          block={block}
          locale={props.locale}
          status={props.confirmationStatus}
          onConfirm={props.onConfirmTransfer}
          onDeny={props.onDenyTransfer}
        />
      );
    case "video_session_cta":
      return <VideoSessionCtaCard block={block} />;
    case "empty_state":
      return <EmptyStateCard block={block} />;
    case "notice":
      return <NoticeCard block={block} />;
    default:
      return null;
  }
}

export function hasTransferConfirmationBlock(blocks?: AssistantResponseBlock[]) {
  return Boolean(blocks?.some((block) => block.type === "transfer_confirmation"));
}

export function AssistantBlocks({
  blocks,
  locale,
  confirmationStatus,
  onConfirmTransfer,
  onDenyTransfer,
}: AssistantBlocksProps) {
  if (blocks.length === 0) {
    return null;
  }

  return (
    <div
      className="assistant-blocks mt-2.5 grid min-w-0 gap-2"
      dir="auto"
      style={{ textAlign: "start", overflowWrap: "anywhere" }}
    >
      {blocks.map((block) => (
        <div key={block.id} className="min-w-0">
          {renderBlock(block, {
            locale,
            confirmationStatus,
            onConfirmTransfer,
            onDenyTransfer,
          })}
        </div>
      ))}
    </div>
  );
}

function renderPlainTextWithIsolates(text: string, keyPrefix: string) {
  const tokenPattern =
    /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|₪\s?[-+]?\d[\d,]*(?:\.\d+)?|[-+]?\d[\d,]*(?:\.\d+)?\s?(?:ILS|NIS|USD|EUR)|\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?\b)/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let matchIndex = 0;

  for (const match of text.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) {
      nodes.push(text.slice(lastIndex, index));
    }

    nodes.push(
      <bdi key={`${keyPrefix}-token-${matchIndex}`} dir="ltr" className="inline-block">
        {token}
      </bdi>,
    );
    lastIndex = index + token.length;
    matchIndex += 1;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderInlineMarkdown(text: string, keyPrefix: string) {
  const nodes: ReactNode[] = [];
  const boldPattern = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let matchIndex = 0;

  for (const match of text.matchAll(boldPattern)) {
    const token = match[0];
    const content = match[1] ?? "";
    const index = match.index ?? 0;

    if (index > lastIndex) {
      nodes.push(...renderPlainTextWithIsolates(text.slice(lastIndex, index), `${keyPrefix}-plain-${matchIndex}`));
    }

    nodes.push(
      <strong key={`${keyPrefix}-bold-${matchIndex}`} className="font-semibold">
        {renderPlainTextWithIsolates(content, `${keyPrefix}-bold-text-${matchIndex}`)}
      </strong>,
    );
    lastIndex = index + token.length;
    matchIndex += 1;
  }

  if (lastIndex < text.length) {
    nodes.push(...renderPlainTextWithIsolates(text.slice(lastIndex), `${keyPrefix}-plain-tail`));
  }

  return nodes;
}

export function AssistantMarkdown({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const nodes: ReactNode[] = [];
  let bulletItems: string[] = [];

  function flushBullets(key: string) {
    if (bulletItems.length === 0) {
      return;
    }

    nodes.push(
      <ul key={key} className="my-1 list-disc space-y-1 ps-4">
        {bulletItems.map((item, index) => (
          <li key={`${key}-${index}`} className="min-w-0 break-words">
            {renderInlineMarkdown(item, `${key}-${index}`)}
          </li>
        ))}
      </ul>,
    );
    bulletItems = [];
  }

  lines.forEach((line, index) => {
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet?.[1]) {
      bulletItems.push(bullet[1]);
      return;
    }

    flushBullets(`bullets-${index}`);

    if (!line.trim()) {
      nodes.push(<br key={`break-${index}`} />);
      return;
    }

    nodes.push(
      <p
        key={`paragraph-${index}`}
        dir="auto"
        className="min-w-0 break-words leading-5"
      >
        {renderInlineMarkdown(line, `paragraph-${index}`)}
      </p>,
    );
  });

  flushBullets("bullets-tail");

  return (
    <div
      className="assistant-markdown grid min-w-0 gap-1 text-start [overflow-wrap:anywhere]"
      dir="auto"
      style={{ textAlign: "start", overflowWrap: "anywhere" }}
    >
      {nodes}
    </div>
  );
}
