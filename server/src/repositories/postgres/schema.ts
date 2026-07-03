import { sql } from "drizzle-orm";
import {
  pgTable, char, text, boolean, doublePrecision, integer,
  timestamp, jsonb, uniqueIndex, index, check
} from "drizzle-orm/pg-core";

const id = () => char("id", { length: 24 }).primaryKey();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull();

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  phone: text("phone").notNull(),
  isVerified: boolean("is_verified").notNull().default(false),
  personalDetails: char("personal_details", { length: 24 }),
  balance: doublePrecision("balance").notNull(),
  role: text("role").notNull().default("user"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  uniqueIndex("users_email_uq").on(t.email),
  index("users_role_idx").on(t.role),
  check("users_role_ck", sql`${t.role} in ('user','support_agent','sales_agent','support_manager','admin')`)
]);

export const transactions = pgTable("transactions", {
  id: id(),
  ownerId: char("owner_id", { length: 24 }).notNull(),
  counterpartyEmail: text("counterparty_email").notNull(),
  amount: doublePrecision("amount").notNull(),
  type: text("type").notNull(),
  directionLabel: text("direction_label").notNull(),
  reason: text("reason"),
  enteredCurrency: text("entered_currency"),
  enteredAmount: doublePrecision("entered_amount"),
  exchangeRateUsed: doublePrecision("exchange_rate_used"),
  exchangeRateFetchedAt: timestamp("exchange_rate_fetched_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  index("transactions_owner_idx").on(t.ownerId),
  index("transactions_owner_cp_created_idx").on(t.ownerId, t.counterpartyEmail, t.createdAt),
  check("transactions_type_ck", sql`${t.type} in ('credit','debit')`),
  check("transactions_entered_currency_ck", sql`${t.enteredCurrency} is null or ${t.enteredCurrency} in ('ILS','USD','EUR')`)
]);

export const personalDetails = pgTable("personal_details", {
  id: id(),
  userId: char("user_id", { length: 24 }).notNull(),
  status: text("status").notNull().default("not_provided"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  dateOfBirth: timestamp("date_of_birth", { withTimezone: true }),
  address: jsonb("address").notNull().default(sql`'{}'::jsonb`),
  lastSkippedAt: timestamp("last_skipped_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  uniqueIndex("personal_details_user_uq").on(t.userId),
  index("personal_details_name_idx").on(t.firstName, t.lastName),
  check("personal_details_status_ck", sql`${t.status} in ('not_provided','provided')`)
]);

export const exchangeRates = pgTable("exchange_rates", {
  id: id(),
  baseCurrency: text("base_currency").notNull(),
  rates: jsonb("rates").notNull(),
  provider: text("provider").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  validForDate: text("valid_for_date").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  sourceResponseHash: text("source_response_hash"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  uniqueIndex("exchange_rates_base_date_uq").on(t.baseCurrency, t.validForDate),
  index("exchange_rates_base_fetched_idx").on(t.baseCurrency, t.fetchedAt.desc())
]);

export const aiConversations = pgTable("ai_conversations", {
  id: id(),
  userId: char("user_id", { length: 24 }).notNull(),
  conversationId: text("conversation_id").notNull(),
  assistantId: text("assistant_id").notNull().default("oshri"),
  messages: jsonb("messages").notNull().default(sql`'[]'::jsonb`),
  memory: jsonb("memory").notNull().default(sql`'{}'::jsonb`),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  uniqueIndex("ai_conversations_user_conv_uq").on(t.userId, t.conversationId),
  index("ai_conversations_user_idx").on(t.userId),
  index("ai_conversations_conv_idx").on(t.conversationId),
  index("ai_conversations_expires_idx").on(t.expiresAt)
]);

export const aiPendingTransfers = pgTable("ai_pending_transfers", {
  id: id(),
  userId: char("user_id", { length: 24 }).notNull(),
  conversationId: text("conversation_id").notNull(),
  assistantId: text("assistant_id").notNull().default("oshri"),
  recipientEmail: text("recipient_email").notNull(),
  version: integer("version").notNull().default(1),
  currency: text("currency").notNull().default("ILS"),
  recipientFirstName: text("recipient_first_name"),
  recipientLastName: text("recipient_last_name"),
  amount: doublePrecision("amount").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("pending"),
  supersededById: char("superseded_by_id", { length: 24 }),
  supersedesId: char("supersedes_id", { length: 24 }),
  idempotencyResults: jsonb("idempotency_results").notNull().default(sql`'{}'::jsonb`),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  index("ai_pending_user_idx").on(t.userId),
  index("ai_pending_conv_idx").on(t.conversationId),
  index("ai_pending_status_idx").on(t.status),
  index("ai_pending_expires_idx").on(t.expiresAt),
  check("ai_pending_status_ck", sql`${t.status} in ('pending','confirmed','denied','expired','superseded','held')`),
  check("ai_pending_currency_ck", sql`${t.currency} = 'ILS'`)
]);

export const aiAuditLogs = pgTable("ai_audit_logs", {
  id: id(),
  userId: char("user_id", { length: 24 }).notNull(),
  conversationId: text("conversation_id").notNull(),
  requestId: text("request_id"),
  assistantId: text("assistant_id").notNull().default("oshri"),
  intent: text("intent").notNull(),
  toolsRequested: text("tools_requested").array().notNull().default(sql`'{}'::text[]`),
  toolsExecuted: text("tools_executed").array().notNull().default(sql`'{}'::text[]`),
  refusalReason: text("refusal_reason"),
  diagnostics: jsonb("diagnostics").notNull().default(sql`'[]'::jsonb`),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  index("ai_audit_user_idx").on(t.userId),
  index("ai_audit_conv_idx").on(t.conversationId),
  index("ai_audit_request_idx").on(t.requestId)
]);

export const videoSessions = pgTable("video_sessions", {
  id: id(),
  userId: char("user_id", { length: 24 }).notNull(),
  assignedAgentId: char("assigned_agent_id", { length: 24 }),
  type: text("type").notNull(),
  status: text("status").notNull().default("waiting_for_agent"),
  roomName: text("room_name").notNull(),
  provider: text("provider").notNull(),
  topic: text("topic"),
  userProblemSummary: text("user_problem_summary"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  userJoinedAt: timestamp("user_joined_at", { withTimezone: true }),
  agentJoinedAt: timestamp("agent_joined_at", { withTimezone: true }),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  uniqueIndex("video_sessions_room_uq").on(t.roomName),
  index("video_sessions_user_idx").on(t.userId),
  index("video_sessions_agent_idx").on(t.assignedAgentId),
  index("video_sessions_type_idx").on(t.type),
  index("video_sessions_status_idx").on(t.status),
  check("video_sessions_type_ck", sql`${t.type} in ('support','sales')`),
  check("video_sessions_status_ck", sql`${t.status} in ('requested','waiting_for_agent','active','ended','missed','cancelled','failed')`)
]);

export const verificationTokens = pgTable("verification_tokens", {
  id: id(),
  userId: char("user_id", { length: 24 }).notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  uniqueIndex("verification_tokens_user_id_uq").on(t.userId)
]);

export const communicationProfiles = pgTable("communication_profiles", {
  id: id(),
  userId: char("user_id", { length: 24 }).notNull().unique(),
  formality: jsonb("formality"),
  verbosity: jsonb("verbosity"),
  complexity: jsonb("complexity"),
  humor: jsonb("humor"),
  pace: jsonb("pace"),
  memory: text("memory").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contacts = pgTable(
  "contacts",
  {
    id: char("id", { length: 24 }).primaryKey(),
    ownerId: char("owner_id", { length: 24 }).notNull(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (t) => [
    uniqueIndex("contacts_owner_email_uq").on(t.ownerId, t.email),
    index("contacts_owner_idx").on(t.ownerId)
  ]
);

export const videoAuditLogs = pgTable("video_audit_logs", {
  id: id(),
  event: text("event").notNull(),
  actorId: char("actor_id", { length: 24 }).notNull(),
  actorRole: text("actor_role").notNull(),
  targetUserId: char("target_user_id", { length: 24 }).notNull(),
  videoSessionId: char("video_session_id", { length: 24 }).notNull(),
  sessionType: text("session_type").notNull(),
  result: text("result").notNull().default("success"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  details: jsonb("details").notNull().default(sql`'{}'::jsonb`),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (t) => [
  index("video_audit_event_idx").on(t.event),
  index("video_audit_actor_idx").on(t.actorId),
  index("video_audit_target_idx").on(t.targetUserId),
  index("video_audit_session_idx").on(t.videoSessionId),
  check("video_audit_result_ck", sql`${t.result} in ('success','failure')`),
  check("video_audit_session_type_ck", sql`${t.sessionType} in ('support','sales')`),
  check("video_audit_actor_role_ck", sql`${t.actorRole} in ('user','support_agent','sales_agent','support_manager','admin')`)
]);
