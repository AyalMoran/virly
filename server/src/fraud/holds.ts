/**
 * Held-transfer store for the fraud hold-until-email-confirmation flow
 * (RAG_PLAN.md M4 follow-up).
 *
 * When a transfer scores at/above the configured hold level it is NOT executed;
 * instead a held record + a one-time email token are created here, and the
 * transfer executes only when the sender opens the confirmation link. Lives in
 * the AI Postgres (self-managed table, like the fraud flags). The actual money
 * move still happens through the app's `executeTransfer` (app DB transaction) —
 * this store only holds the intent + token.
 */
import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";

import { config } from "../config.js";
import { getAiDb } from "../db/vector.js";
import { newObjectId } from "../repositories/postgres/id.js";
import { executeTransfer } from "../services/transfer.service.js";
import type { RiskLevel } from "./risk.js";

export type HeldTransferStatus = "pending" | "confirming" | "confirmed" | "cancelled" | "expired";

/** Executes the money move on confirmation; injectable for tests. */
export type TransferExecutor = (input: {
  senderId: string;
  recipientEmail: string;
  amount: number;
  reason?: string | null;
  fx?: unknown;
}) => Promise<{ newBalance: number; transaction: { id?: string } }>;

export type CreateHoldInput = {
  userId: string;
  recipientEmail: string;
  amount: number;
  currency: string;
  reason?: string | null;
  fx?: unknown;
  score: number;
  level: RiskLevel;
  reasons: string[];
};

export type HoldPolicy = "off" | "medium" | "high";

/** Decide whether a transfer at `level` should be held under `policy` (defaults to config). */
export function shouldHold(level: RiskLevel, policy: HoldPolicy = config.fraud.holdLevel): boolean {
  if (policy === "off") return false;
  if (policy === "high") return level === "high";
  return level === "high" || level === "medium"; // "medium" policy: hold medium+
}

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

/** jsonb stores the fx `exchangeRateFetchedAt` as a string; restore it to a Date. */
function coerceFx(fx: unknown): unknown {
  if (!fx || typeof fx !== "object") return undefined;
  const f = fx as Record<string, unknown>;
  if (typeof f.exchangeRateFetchedAt === "string") {
    return { ...f, exchangeRateFetchedAt: new Date(f.exchangeRateFetchedAt) };
  }
  return fx;
}

let didSetup = false;

export async function setupHoldsTable(): Promise<void> {
  if (didSetup) return;
  const db = getAiDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS held_transfers (
      id char(24) PRIMARY KEY,
      user_id char(24) NOT NULL,
      recipient_email text NOT NULL,
      amount double precision NOT NULL,
      currency text NOT NULL DEFAULT 'ILS',
      reason text,
      fx jsonb,
      score double precision NOT NULL,
      level text NOT NULL,
      reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
      token_hash text NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      transaction_id char(24),
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS held_transfers_user_idx ON held_transfers (user_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS held_transfers_status_idx ON held_transfers (status)`);
  didSetup = true;
}

/** Create a held transfer; returns the id + the RAW token (for the email link). */
export async function createHold(
  input: CreateHoldInput
): Promise<{ id: string; token: string; expiresAt: Date }> {
  await setupHoldsTable();
  const id = newObjectId();
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + config.fraud.holdExpiryHours * 60 * 60 * 1000);
  await getAiDb().execute(sql`
    INSERT INTO held_transfers
      (id, user_id, recipient_email, amount, currency, reason, fx, score, level, reasons, token_hash, status, expires_at, created_at, updated_at)
    VALUES (
      ${id}, ${input.userId}, ${input.recipientEmail.trim().toLowerCase()}, ${input.amount},
      ${input.currency}, ${input.reason ?? null},
      ${input.fx ? JSON.stringify(input.fx) : null}::jsonb,
      ${input.score}, ${input.level}, ${JSON.stringify(input.reasons)}::jsonb,
      ${sha256(token)}, 'pending', ${expiresAt}, now(), now()
    )
  `);
  return { id, token, expiresAt };
}

export type HeldTransferView = {
  id: string;
  recipientEmail: string;
  amount: number;
  currency: string;
  status: HeldTransferStatus;
  level: string;
  reasons: string[];
  expiresAt: Date;
};

type HeldRow = {
  id: string;
  user_id: string;
  recipient_email: string;
  amount: number;
  currency: string;
  reason: string | null;
  fx: unknown;
  level: string;
  reasons: string[];
  token_hash: string;
  status: HeldTransferStatus;
  transaction_id: string | null;
  expires_at: Date | string;
};

function rows<T>(res: unknown): T[] {
  return (res as { rows: T[] }).rows;
}

export async function getHold(id: string): Promise<HeldTransferView | null> {
  await setupHoldsTable();
  const r = rows<HeldRow>(
    await getAiDb().execute(sql`SELECT * FROM held_transfers WHERE id = ${id} LIMIT 1`)
  )[0];
  if (!r) return null;
  return {
    id: r.id,
    recipientEmail: r.recipient_email,
    amount: r.amount,
    currency: r.currency,
    status: r.status,
    level: r.level,
    reasons: r.reasons ?? [],
    expiresAt: r.expires_at instanceof Date ? r.expires_at : new Date(r.expires_at)
  };
}

export type ConfirmResult =
  | { status: "executed"; transactionId?: string; newBalance: number }
  | { status: "already_confirmed"; transactionId?: string }
  | { status: "expired" }
  | { status: "cancelled" }
  | { status: "in_progress" }
  | { status: "invalid" }
  | { status: "failed"; message: string };

/**
 * Confirm a held transfer and execute it exactly once. A compare-and-set claims
 * the row (pending → confirming) so concurrent clicks can't double-spend; the
 * money move runs only for the winner, then the row flips to confirmed (or back
 * to pending on failure, so it stays retryable).
 */
export async function confirmHold(
  id: string,
  token: string,
  opts: { execute?: TransferExecutor } = {}
): Promise<ConfirmResult> {
  await setupHoldsTable();
  const db = getAiDb();
  const execute: TransferExecutor = opts.execute ?? (executeTransfer as TransferExecutor);
  const hash = sha256(token);

  const claimed = rows<HeldRow>(
    await db.execute(sql`
      UPDATE held_transfers SET status = 'confirming', updated_at = now()
      WHERE id = ${id} AND status = 'pending' AND token_hash = ${hash} AND expires_at > now()
      RETURNING *
    `)
  )[0];

  if (!claimed) {
    // Didn't win the claim — explain why (idempotent success vs. invalid/expired).
    const current = rows<HeldRow>(
      await db.execute(sql`SELECT * FROM held_transfers WHERE id = ${id} LIMIT 1`)
    )[0];
    if (!current || current.token_hash !== hash) return { status: "invalid" };
    if (current.status === "confirmed") {
      return { status: "already_confirmed", transactionId: current.transaction_id ?? undefined };
    }
    if (current.status === "confirming") return { status: "in_progress" };
    if (current.status === "cancelled") return { status: "cancelled" };
    return { status: "expired" };
  }

  try {
    const result = await execute({
      senderId: claimed.user_id,
      recipientEmail: claimed.recipient_email,
      amount: claimed.amount,
      reason: claimed.reason,
      fx: coerceFx(claimed.fx)
    });
    const txId = result.transaction?.id ?? null;
    await db.execute(sql`
      UPDATE held_transfers SET status = 'confirmed', transaction_id = ${txId}, updated_at = now()
      WHERE id = ${id}
    `);
    return { status: "executed", transactionId: txId ?? undefined, newBalance: result.newBalance };
  } catch (error) {
    // Revert so the user can retry; money did not move.
    await db.execute(sql`
      UPDATE held_transfers SET status = 'pending', updated_at = now()
      WHERE id = ${id} AND status = 'confirming'
    `);
    return { status: "failed", message: error instanceof Error ? error.message : "transfer failed" };
  }
}

export type HeldTransferListItem = {
  id: string;
  userId: string;
  recipientEmail: string;
  amount: number;
  status: HeldTransferStatus;
  level: string;
  reasons: string[];
  createdAt: Date;
  expiresAt: Date;
};

/** Read recent held transfers (analyst surface), newest first, optionally filtered. */
export async function listHeldTransfers(
  opts: { status?: HeldTransferStatus; userId?: string; limit?: number } = {}
): Promise<HeldTransferListItem[]> {
  await setupHoldsTable();
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const conds = [];
  if (opts.status) conds.push(sql`status = ${opts.status}`);
  if (opts.userId) conds.push(sql`user_id = ${opts.userId}`);
  const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
  const res = await getAiDb().execute(sql`
    SELECT id, user_id, recipient_email, amount, status, level, reasons, created_at, expires_at
    FROM held_transfers ${where} ORDER BY created_at DESC LIMIT ${limit}
  `);
  return rows<HeldRow & { created_at: Date | string }>(res).map((r) => ({
    id: r.id,
    userId: r.user_id,
    recipientEmail: r.recipient_email,
    amount: r.amount,
    status: r.status,
    level: r.level,
    reasons: r.reasons ?? [],
    createdAt:
      (r as { created_at?: Date | string }).created_at instanceof Date
        ? ((r as { created_at: Date }).created_at)
        : new Date((r as { created_at: string }).created_at),
    expiresAt: r.expires_at instanceof Date ? r.expires_at : new Date(r.expires_at)
  }));
}

/** Cancel a pending held transfer (token-guarded). */
export async function cancelHold(id: string, token: string): Promise<boolean> {
  await setupHoldsTable();
  const res = await getAiDb().execute(sql`
    UPDATE held_transfers SET status = 'cancelled', updated_at = now()
    WHERE id = ${id} AND token_hash = ${sha256(token)} AND status = 'pending'
    RETURNING id
  `);
  return rows<{ id: string }>(res).length > 0;
}
