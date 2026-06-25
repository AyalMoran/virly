// src/repositories/postgres/aiPendingTransfer.repository.ts

import { eq, and, gt, desc, sql } from "drizzle-orm";
import { aiPendingTransfers } from "./schema.js";
import { asPgTx } from "./transaction.js";
import { newObjectId, isObjectIdHex } from "./id.js";
import type {
  AiPendingTransferRecord,
  AiPendingTransferRepository,
  AiPendingTransferStatusUpdate,
  TxContext
} from "../types.js";

type Row = typeof aiPendingTransfers.$inferSelect;

/** Idempotency keys are interpolated into a jsonb path; restrict them to a safe
 * character set so they can never break out of the `{<key>}` array literal. */
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]+$/;

function assertSafeKey(key: string): void {
  if (!IDEMPOTENCY_KEY_RE.test(key)) {
    throw new Error(`Unsafe idempotency key: ${JSON.stringify(key)}`);
  }
}

/** `jsonb_set(idempotency_results, '{<key>}', <value>::jsonb, true)` — the key is
 * validated by {@link assertSafeKey}; the value is bound + cast to jsonb. */
function jsonbSetIdempotency(key: string, value: unknown) {
  assertSafeKey(key);
  return sql`jsonb_set(${aiPendingTransfers.idempotencyResults}, ${`{${key}}`}::text[], ${JSON.stringify(value ?? null)}::jsonb, true)`;
}

function toRecord(r: Row): AiPendingTransferRecord {
  return {
    id: r.id,
    userId: r.userId,
    conversationId: r.conversationId,
    assistantId: r.assistantId,
    recipientEmail: r.recipientEmail,
    version: r.version,
    currency: r.currency as "ILS",
    recipientFirstName: r.recipientFirstName ?? null,
    recipientLastName: r.recipientLastName ?? null,
    amount: r.amount,
    reason: r.reason ?? null,
    status: r.status as AiPendingTransferRecord["status"],
    supersededById: r.supersededById ?? null,
    supersedesId: r.supersedesId ?? null,
    idempotencyResults: r.idempotencyResults as Record<string, unknown>,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  };
}

export const postgresAiPendingTransferRepository: AiPendingTransferRepository = {
  async findById(id: string, tx?: TxContext): Promise<AiPendingTransferRecord | null> {
    if (!isObjectIdHex(id)) return null;
    const [r] = await asPgTx(tx)
      .select()
      .from(aiPendingTransfers)
      .where(eq(aiPendingTransfers.id, id))
      .limit(1);
    return r ? toRecord(r) : null;
  },

  async findActiveForConversation(userId, conversationId, tx) {
    const [r] = await asPgTx(tx)
      .select()
      .from(aiPendingTransfers)
      .where(
        and(
          eq(aiPendingTransfers.userId, userId),
          eq(aiPendingTransfers.conversationId, conversationId),
          eq(aiPendingTransfers.status, "pending"),
          gt(aiPendingTransfers.expiresAt, new Date())
        )
      )
      .limit(1);
    return r ? toRecord(r) : null;
  },

  async findActivePendingForUser(id, userId, conversationId, tx) {
    if (!isObjectIdHex(id)) return null;
    const [r] = await asPgTx(tx)
      .select()
      .from(aiPendingTransfers)
      .where(
        and(
          eq(aiPendingTransfers.id, id),
          eq(aiPendingTransfers.userId, userId),
          eq(aiPendingTransfers.conversationId, conversationId),
          eq(aiPendingTransfers.status, "pending"),
          gt(aiPendingTransfers.expiresAt, new Date())
        )
      )
      .limit(1);
    return r ? toRecord(r) : null;
  },

  async listActivePendingForUser({ userId, conversationId, limit }, tx) {
    const conditions = [
      eq(aiPendingTransfers.userId, userId),
      eq(aiPendingTransfers.status, "pending"),
      gt(aiPendingTransfers.expiresAt, new Date())
    ];
    if (conversationId) conditions.push(eq(aiPendingTransfers.conversationId, conversationId));

    const rows = await asPgTx(tx)
      .select()
      .from(aiPendingTransfers)
      .where(and(...conditions))
      .orderBy(desc(aiPendingTransfers.createdAt))
      .limit(limit);
    return rows.map(toRecord);
  },

  async create(input, tx) {
    const now = new Date();
    const [r] = await asPgTx(tx)
      .insert(aiPendingTransfers)
      .values({
        id: newObjectId(),
        userId: input.userId,
        conversationId: input.conversationId,
        assistantId: input.assistantId,
        recipientEmail: input.recipientEmail,
        version: input.version,
        currency: input.currency,
        recipientFirstName: input.recipientFirstName,
        recipientLastName: input.recipientLastName,
        amount: input.amount,
        reason: input.reason,
        status: input.status,
        supersededById: input.supersededById,
        supersedesId: input.supersedesId,
        idempotencyResults: input.idempotencyResults,
        expiresAt: input.expiresAt,
        createdAt: now,
        updatedAt: now
      })
      .returning();
    if (!r) {
      throw new Error("create: insert returned no row.");
    }
    return toRecord(r);
  },

  async updateStatus(
    id: string,
    status: AiPendingTransferRecord["status"],
    update?: AiPendingTransferStatusUpdate,
    tx?: TxContext
  ): Promise<AiPendingTransferRecord | null> {
    if (!isObjectIdHex(id)) return null;

    const conditions = [eq(aiPendingTransfers.id, id)];
    if (update?.userId !== undefined) conditions.push(eq(aiPendingTransfers.userId, update.userId));
    if (update?.version !== undefined) conditions.push(eq(aiPendingTransfers.version, update.version));
    if (update?.expectedStatus !== undefined) conditions.push(eq(aiPendingTransfers.status, update.expectedStatus));
    if (update?.notExpired) conditions.push(gt(aiPendingTransfers.expiresAt, new Date()));

    const set: Record<string, unknown> = {
      status,
      updatedAt: new Date()
    };
    if (update?.supersededById !== undefined) {
      set.supersededById = update.supersededById;
    }
    if (update?.idempotencyKey !== undefined) {
      set.idempotencyResults = jsonbSetIdempotency(update.idempotencyKey, update.idempotencyResult);
    }

    const [r] = await asPgTx(tx)
      .update(aiPendingTransfers)
      .set(set)
      .where(and(...conditions))
      .returning();
    return r ? toRecord(r) : null;
  },

  async setIdempotencyResult(id, key, value, tx) {
    if (!isObjectIdHex(id)) return;
    await asPgTx(tx)
      .update(aiPendingTransfers)
      .set({
        idempotencyResults: jsonbSetIdempotency(key, value),
        updatedAt: new Date()
      })
      .where(eq(aiPendingTransfers.id, id));
  }
};
