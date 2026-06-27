/**
 * Fraud scoring service for REAL Virly transfers (RAG_PLAN.md M4 phase 3).
 *
 * The single seam both the AI assistant (prepare-step warning + a tool) and the
 * transfer flow (post-commit flag) call. Scoring reads only the app repositories
 * (works in mongo or postgres mode); flag persistence writes to the AI Postgres
 * and is BEST-EFFORT — it never affects a transfer. Unsupervised + rules, no
 * embeddings, no labels (the Kaggle model is a separate benchmark).
 */
import { sql } from "drizzle-orm";

import { config } from "../config.js";
import { getAiDb } from "../db/vector.js";
import { getRepositories } from "../repositories/index.js";
import { newObjectId } from "../repositories/postgres/id.js";
import { knnAnomalyScore } from "./anomaly.js";
import { computeRisk, type RiskResult } from "./risk.js";

export type ScoreTransferInput = {
  userId: string;
  recipientEmail: string;
  amount: number;
  now?: Date;
  /** True when scoring AFTER the transfer's debit row already exists (post-commit). */
  alreadyExecuted?: boolean;
};

const RECENT_DEBIT_LIMIT = 50;

/** UTC day window [start, end) around `now` for the daily-usage signal. */
function dayWindow(now: Date): { dayStart: Date; dayEnd: Date } {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  return { dayStart, dayEnd };
}

/** Score a (prospective or just-executed) transfer. Reads app repos only. */
export async function scoreTransfer(input: ScoreTransferInput): Promise<RiskResult> {
  const repos = getRepositories();
  const now = input.now ?? new Date();
  const ownerId = input.userId;
  const counterpartyEmail = input.recipientEmail.trim().toLowerCase();

  const [hasDebit, daily, recent] = await Promise.all([
    repos.transactions.hasDebitToCounterparty({ ownerId, counterpartyEmail }),
    repos.transactions.getDailyDebitUsage({ ownerId, ...dayWindow(now) }),
    repos.transactions.recentForOwner({ ownerId, type: "debit", limit: RECENT_DEBIT_LIMIT })
  ]);

  // When scoring post-commit, the newest debit IS this transfer — drop it so it
  // isn't compared against itself (anomaly) or counted twice.
  const history = input.alreadyExecuted ? recent.slice(1) : recent;
  const recentDebitAmounts = history.map((t) => t.amount);
  const anomalyScore = knnAnomalyScore(
    history.map((t) => [t.amount, t.createdAt.getUTCHours()]),
    [input.amount, now.getUTCHours()]
  );
  const projectedDailyTotal = input.alreadyExecuted ? daily.total : daily.total + input.amount;

  return computeRisk({
    amount: input.amount,
    hourOfDay: now.getUTCHours(),
    isNewCounterparty: !hasDebit,
    perTransferLimit: config.ai.perTransferLimit,
    dailyLimit: config.ai.dailyTransferLimit,
    projectedDailyTotal,
    recentDebitAmounts,
    anomalyScore
  });
}

let didSetupFlags = false;

async function setupFlagsTable(): Promise<void> {
  if (didSetupFlags) return;
  const db = getAiDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_fraud_flags (
      id char(24) PRIMARY KEY,
      user_id char(24) NOT NULL,
      transaction_id char(24),
      recipient_email text NOT NULL,
      amount double precision NOT NULL,
      score double precision NOT NULL,
      level text NOT NULL,
      reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ai_fraud_flags_user_idx ON ai_fraud_flags (user_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS ai_fraud_flags_level_idx ON ai_fraud_flags (level)`);
  didSetupFlags = true;
}

/**
 * Score a just-executed transfer and persist a flag when it is not low risk.
 * BEST-EFFORT: any failure (scoring or the AI Postgres being unavailable) is
 * swallowed so it can never affect a completed transfer. Returns the result, or
 * null if scoring itself failed.
 */
export async function recordTransferRiskFlag(
  input: ScoreTransferInput & { transactionId?: string }
): Promise<RiskResult | null> {
  let result: RiskResult;
  try {
    result = await scoreTransfer({ ...input, alreadyExecuted: input.alreadyExecuted ?? true });
  } catch {
    return null;
  }
  if (result.level === "low") return result;
  try {
    await setupFlagsTable();
    await getAiDb().execute(sql`
      INSERT INTO ai_fraud_flags (id, user_id, transaction_id, recipient_email, amount, score, level, reasons, created_at)
      VALUES (
        ${newObjectId()}, ${input.userId}, ${input.transactionId ?? null},
        ${input.recipientEmail.trim().toLowerCase()}, ${input.amount}, ${result.score},
        ${result.level}, ${JSON.stringify(result.reasons)}::jsonb, now()
      )
    `);
  } catch {
    // AI Postgres not configured / transient: flagging is best-effort.
  }
  return result;
}

export type FraudFlagView = {
  id: string;
  userId: string;
  transactionId: string | null;
  recipientEmail: string;
  amount: number;
  score: number;
  level: string;
  reasons: string[];
  createdAt: Date;
};

type FlagRow = {
  id: string;
  user_id: string;
  transaction_id: string | null;
  recipient_email: string;
  amount: number;
  score: number;
  level: string;
  reasons: string[];
  created_at: Date | string;
};

/** Read recent fraud flags (analyst surface), newest first, optionally filtered. */
export async function listFraudFlags(
  opts: { level?: string; userId?: string; limit?: number } = {}
): Promise<FraudFlagView[]> {
  await setupFlagsTable();
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const conds = [];
  if (opts.level) conds.push(sql`level = ${opts.level}`);
  if (opts.userId) conds.push(sql`user_id = ${opts.userId}`);
  const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
  const res = await getAiDb().execute(sql`
    SELECT id, user_id, transaction_id, recipient_email, amount, score, level, reasons, created_at
    FROM ai_fraud_flags ${where} ORDER BY created_at DESC LIMIT ${limit}
  `);
  return (res as unknown as { rows: FlagRow[] }).rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    transactionId: r.transaction_id ?? null,
    recipientEmail: r.recipient_email,
    amount: r.amount,
    score: r.score,
    level: r.level,
    reasons: r.reasons ?? [],
    createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at)
  }));
}
