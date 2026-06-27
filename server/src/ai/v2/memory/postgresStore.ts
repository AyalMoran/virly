/**
 * Postgres-backed long-term store (RAG_PLAN.md §7 / M1.5).
 *
 * `@langchain/langgraph-checkpoint-postgres` ships a `PostgresSaver` but NO
 * `PostgresStore`, so we hand-roll a `BaseStore` over the dedicated AI Postgres.
 * Only `batch()` is abstract; `get`/`put`/`search`/`delete`/`listNamespaces` are
 * provided by the base class and route through it. Items live in one table keyed
 * by (prefix, key), where `prefix` is the namespace joined by a control char.
 *
 * Parity target: the `MongoDBStore` usage in store.ts — namespaced get/put plus
 * `search(namespace, { limit })`. We also implement filter, pagination, and
 * listNamespaces faithfully so the store is a correct general `BaseStore`.
 */
import { BaseStore } from "@langchain/langgraph";
import type {
  GetOperation,
  Item,
  ListNamespacesOperation,
  Operation,
  OperationResults,
  PutOperation,
  SearchOperation
} from "@langchain/langgraph";
import { sql } from "drizzle-orm";

import { getAiDb } from "../../../db/vector.js";

/** ASCII Unit Separator joins namespace segments; not expected inside a segment. */
const SEP = String.fromCharCode(31);

type SearchItem = Item & { score?: number };

function toPrefix(namespace: string[]): string {
  return namespace.join(SEP);
}
function fromPrefix(prefix: string): string[] {
  return prefix.length === 0 ? [] : prefix.split(SEP);
}
/** Escape LIKE wildcards so a namespace segment is matched literally. */
function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

type Row = {
  prefix: string;
  key: string;
  value: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
};

function rowToItem(row: Row): Item {
  return {
    value: row.value,
    key: row.key,
    namespace: fromPrefix(row.prefix),
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at)
  };
}

/** Apply a single condition (mirrors the common Mongo/Store comparison operators). */
function matchesCondition(actual: unknown, condition: unknown): boolean {
  if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
    return Object.entries(condition as Record<string, unknown>).every(([op, expected]) => {
      switch (op) {
        case "$eq":
          return actual === expected;
        case "$ne":
          return actual !== expected;
        case "$gt":
          return (actual as number) > (expected as number);
        case "$gte":
          return (actual as number) >= (expected as number);
        case "$lt":
          return (actual as number) < (expected as number);
        case "$lte":
          return (actual as number) <= (expected as number);
        case "$in":
          return Array.isArray(expected) && expected.includes(actual);
        default:
          return false;
      }
    });
  }
  return actual === condition;
}

function matchesFilter(value: Record<string, unknown>, filter?: Record<string, unknown>): boolean {
  if (!filter) return true;
  return Object.entries(filter).every(([key, condition]) => matchesCondition(value[key], condition));
}

export class PostgresLongTermStore extends BaseStore {
  private didSetup = false;

  /** Create the backing table + prefix index (idempotent). */
  async setup(): Promise<void> {
    if (this.didSetup) return;
    const db = getAiDb();
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ai_memory_store (
        prefix text NOT NULL,
        key text NOT NULL,
        value jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (prefix, key)
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS ai_memory_store_prefix_idx ON ai_memory_store (prefix text_pattern_ops)`
    );
    this.didSetup = true;
  }

  private async ensureSetup(): Promise<void> {
    if (!this.didSetup) await this.setup();
  }

  private async runGet(op: GetOperation): Promise<Item | null> {
    const db = getAiDb();
    const res = await db.execute(sql`
      SELECT prefix, key, value, created_at, updated_at
      FROM ai_memory_store
      WHERE prefix = ${toPrefix(op.namespace)} AND key = ${op.key}
      LIMIT 1
    `);
    const row = (res as unknown as { rows: Row[] }).rows[0];
    return row ? rowToItem(row) : null;
  }

  private async runPut(op: PutOperation): Promise<void> {
    const db = getAiDb();
    const prefix = toPrefix(op.namespace);
    if (op.value === null) {
      await db.execute(
        sql`DELETE FROM ai_memory_store WHERE prefix = ${prefix} AND key = ${op.key}`
      );
      return;
    }
    const json = JSON.stringify(op.value);
    await db.execute(sql`
      INSERT INTO ai_memory_store (prefix, key, value, created_at, updated_at)
      VALUES (${prefix}, ${op.key}, ${json}::jsonb, now(), now())
      ON CONFLICT (prefix, key)
      DO UPDATE SET value = ${json}::jsonb, updated_at = now()
    `);
  }

  private async runSearch(op: SearchOperation): Promise<SearchItem[]> {
    const db = getAiDb();
    const prefix = toPrefix(op.namespacePrefix);
    // Order most-recently-updated first, with `key` as a deterministic tiebreaker.
    // This differs from MongoDBStore, which returns natural (insertion) order; the
    // difference is only observable once a single namespace holds more items than
    // the caller's `limit` (e.g. readLongTermSnapshot's 200) — below that the
    // result sets are identical. Keeping the most-recent items on truncation is the
    // more useful behavior for long-term memory.
    const rowsRes =
      op.namespacePrefix.length === 0
        ? await db.execute(sql`
            SELECT prefix, key, value, created_at, updated_at
            FROM ai_memory_store
            ORDER BY updated_at DESC, key ASC
          `)
        : await db.execute(sql`
            SELECT prefix, key, value, created_at, updated_at
            FROM ai_memory_store
            WHERE prefix = ${prefix}
               OR prefix LIKE ${`${escapeLike(prefix)}${SEP}%`} ESCAPE '\\'
            ORDER BY updated_at DESC, key ASC
          `);
    const rows = (rowsRes as unknown as { rows: Row[] }).rows;
    const matched = rows.map(rowToItem).filter((item) => matchesFilter(item.value, op.filter));
    const offset = op.offset ?? 0;
    const limit = op.limit ?? 10;
    return matched.slice(offset, offset + limit);
  }

  private async runListNamespaces(op: ListNamespacesOperation): Promise<string[][]> {
    const db = getAiDb();
    const res = await db.execute(sql`SELECT DISTINCT prefix FROM ai_memory_store`);
    const rows = (res as unknown as { rows: Array<{ prefix: string }> }).rows;
    let namespaces = rows.map((r) => fromPrefix(r.prefix));

    for (const condition of op.matchConditions ?? []) {
      const path = condition.path;
      if (condition.matchType === "prefix") {
        namespaces = namespaces.filter((ns) =>
          path.every((seg, i) => seg === "*" || ns[i] === seg)
        );
      } else if (condition.matchType === "suffix") {
        namespaces = namespaces.filter((ns) => {
          const start = ns.length - path.length;
          return start >= 0 && path.every((seg, i) => seg === "*" || ns[start + i] === seg);
        });
      }
    }

    if (op.maxDepth !== undefined) {
      const seen = new Set<string>();
      namespaces = namespaces
        .map((ns) => ns.slice(0, op.maxDepth))
        .filter((ns) => {
          const k = ns.join(SEP);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
    }

    namespaces.sort((a, b) => a.join(SEP).localeCompare(b.join(SEP)));
    const offset = op.offset ?? 0;
    const limit = op.limit ?? 100;
    return namespaces.slice(offset, offset + limit);
  }

  async batch<Op extends Operation[]>(operations: Op): Promise<OperationResults<Op>> {
    await this.ensureSetup();
    const results: unknown[] = [];
    for (const op of operations) {
      if ("namespacePrefix" in op) {
        results.push(await this.runSearch(op));
      } else if ("value" in op) {
        results.push(await this.runPut(op));
      } else if ("namespace" in op && "key" in op) {
        results.push(await this.runGet(op));
      } else {
        results.push(await this.runListNamespaces(op));
      }
    }
    return results as OperationResults<Op>;
  }
}

let cached: PostgresLongTermStore | undefined;

/** Process-wide singleton Postgres long-term store over the AI Postgres. */
export function getPostgresLongTermStore(): PostgresLongTermStore {
  if (!cached) cached = new PostgresLongTermStore();
  return cached;
}
