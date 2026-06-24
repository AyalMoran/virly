// server/scripts/_entities.ts
//
// Shared config for the migration scripts. These live OUTSIDE src/, so (unlike
// the repositories) they may import BOTH the Mongoose models AND the Drizzle
// schema directly — they are one-shot migration infra, not covered by the seam
// guard and not part of `npm run build`.
import { getTableColumns } from "drizzle-orm";
import { Types, type Model } from "mongoose";
import type { PgTable } from "drizzle-orm/pg-core";

import { User } from "../src/models/User.js";
import { PersonalDetails } from "../src/models/PersonalDetails.js";
import { Transaction } from "../src/models/Transaction.js";
import { ExchangeRate } from "../src/models/ExchangeRate.js";
import { AiConversation } from "../src/models/AiConversation.js";
import { AiPendingTransfer } from "../src/models/AiPendingTransfer.js";
import { AiAuditLog } from "../src/models/AiAuditLog.js";
import { VideoSession } from "../src/models/VideoSession.js";
import { VideoAuditLog } from "../src/models/VideoAuditLog.js";

import {
  users,
  personalDetails,
  transactions,
  exchangeRates,
  aiConversations,
  aiPendingTransfers,
  aiAuditLogs,
  videoSessions,
  videoAuditLogs
} from "../src/repositories/postgres/schema.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Entity = { name: string; model: Model<any>; table: PgTable };

// Advisory FK-safe order (users first, dependants after). The PG schema declares
// no FK constraints, so any order inserts cleanly — this just reads naturally.
export const ENTITIES: Entity[] = [
  { name: "users", model: User, table: users },
  { name: "personal_details", model: PersonalDetails, table: personalDetails },
  { name: "transactions", model: Transaction, table: transactions },
  { name: "exchange_rates", model: ExchangeRate, table: exchangeRates },
  { name: "ai_conversations", model: AiConversation, table: aiConversations },
  { name: "ai_pending_transfers", model: AiPendingTransfer, table: aiPendingTransfers },
  { name: "ai_audit_logs", model: AiAuditLog, table: aiAuditLogs },
  { name: "video_sessions", model: VideoSession, table: videoSessions },
  { name: "video_audit_logs", model: VideoAuditLog, table: videoAuditLogs }
];

/** TS property names of a Drizzle table's columns (e.g. ["id","userId",...]). */
export function tableColumnNames(table: PgTable): string[] {
  return Object.keys(getTableColumns(table));
}

/** Convert one top-level Mongo value to its Postgres-row form: ObjectId -> hex
 * string, Map -> plain object; everything else (Date, primitives, jsonb objects)
 * passes through unchanged. */
export function mongoValueToPg(v: unknown): unknown {
  if (v instanceof Types.ObjectId) return v.toString();
  if (v instanceof Map) return Object.fromEntries(v);
  return v;
}

/** Build a Drizzle insert row from a lean Mongo doc, restricted to the table's
 * columns: `_id` -> `id` (string), every other column mapped via mongoValueToPg. */
export function docToRow(doc: Record<string, unknown>, table: PgTable): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const col of tableColumnNames(table)) {
    row[col] = col === "id" ? String(doc._id) : mongoValueToPg(doc[col]);
  }
  return row;
}

/** Build a Mongo doc from a Drizzle row: `id` -> `_id`. Mongoose casts the hex
 * strings back to ObjectId for ObjectId-typed paths on write. */
export function rowToDoc(row: Record<string, unknown>): Record<string, unknown> {
  const { id, ...rest } = row;
  return { _id: id, ...rest };
}
