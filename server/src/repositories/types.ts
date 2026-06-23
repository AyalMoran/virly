

export const userRoleValues = ["user", "support_agent", "sales_agent", "support_manager", "admin"] as const;
export type UserRole = (typeof userRoleValues)[number];

// ---- VideoSession enum values (mirrors models/VideoSession.ts) ---------------
// Exported here so consumers outside repositories/mongo/ can import without
// touching models directly.

export const videoSessionTypeValues = ["support", "sales"] as const;
export type VideoSessionType = (typeof videoSessionTypeValues)[number];

export const videoSessionStatusValues = [
  "requested",
  "waiting_for_agent",
  "active",
  "ended",
  "missed",
  "cancelled",
  "failed"
] as const;
export type VideoSessionStatus = (typeof videoSessionStatusValues)[number];

export const videoSessionProviderValues = [
  "jitsi-jaas",
  "jitsi-self-hosted",
  "jitsi-public-demo",
  "mock"
] as const;
export type VideoSessionProvider = (typeof videoSessionProviderValues)[number];

export const videoSessionSourceValues = [
  "dashboard",
  "ai_assistant",
  "transfer_flow",
  "account_page"
] as const;
export type VideoSessionSource = (typeof videoSessionSourceValues)[number];

/** Opaque per-driver transaction handle. Consumers pass it through; never inspect. */
export type TxContext = unknown;

/** Thrown by both driver impls on a unique-constraint violation. */
export class DuplicateKeyError extends Error {
  constructor(public readonly key: string) {
    super(`Duplicate value for unique key: ${key}`);
    this.name = "DuplicateKeyError";
  }
}

// ---- Records (plain POJOs; id is the 24-hex ObjectId string) -----------------

export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  phone: string;
  isVerified: boolean;
  personalDetails: string | null;
  verificationTokenHash: string | null;
  verificationTokenExpiresAt: Date | null;
  balance: number;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
};
export type PublicUserRecord = Omit<UserRecord, "passwordHash" | "verificationTokenHash">;

export type TransactionRecord = {
  id: string;
  ownerId: string;
  counterpartyEmail: string;
  amount: number;
  type: "credit" | "debit";
  directionLabel: string;
  reason: string | null;
  enteredCurrency?: "ILS" | "USD" | "EUR";
  enteredAmount?: number;
  exchangeRateUsed?: number;
  exchangeRateFetchedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type PersonalDetailsRecord = {
  id: string;
  userId: string;
  status: "not_provided" | "provided";
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: Date | null;
  address: Record<string, string | null>;
  lastSkippedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ExchangeRateRecord = {
  id: string;
  baseCurrency: string;
  rates: Record<string, number>;
  provider: string;
  fetchedAt: Date;
  validForDate: string;
  expiresAt: Date;
  sourceResponseHash: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AiConversationRecord = {
  id: string;
  userId: string;
  conversationId: string;
  assistantId: string;
  messages: unknown[];
  memory: Record<string, unknown>;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type AiPendingTransferRecord = {
  id: string;
  userId: string;
  conversationId: string;
  assistantId: string;
  recipientEmail: string;
  version: number;
  currency: "ILS";
  recipientFirstName: string | null;
  recipientLastName: string | null;
  amount: number;
  reason: string | null;
  status: "pending" | "confirmed" | "denied" | "expired" | "superseded";
  supersededById: string | null;
  supersedesId: string | null;
  idempotencyResults: Record<string, unknown>;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type AiAuditLogRecord = {
  id: string;
  userId: string;
  conversationId: string;
  requestId: string | null;
  assistantId: string;
  intent: string;
  toolsRequested: string[];
  toolsExecuted: string[];
  refusalReason: string | null;
  diagnostics: unknown[];
  createdAt: Date;
  updatedAt: Date;
};

export type VideoSessionRecord = {
  id: string;
  userId: string;
  assignedAgentId: string | null;
  type: "support" | "sales";
  status: "requested" | "waiting_for_agent" | "active" | "ended" | "missed" | "cancelled" | "failed";
  roomName: string;
  provider: string;
  topic: string | null;
  userProblemSummary: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  userJoinedAt: Date | null;
  agentJoinedAt: Date | null;
  metadata: { userAgent: string | null; locale: string | null; source: string };
  createdAt: Date;
  updatedAt: Date;
};

export type VideoAuditLogRecord = {
  id: string;
  event: string;
  actorId: string;
  actorRole: UserRole;
  targetUserId: string;
  videoSessionId: string;
  sessionType: "support" | "sales";
  result: "success" | "failure";
  ipAddress: string | null;
  userAgent: string | null;
  details: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

// ---- Repository interfaces ----------------------------------------------------
// NOTE to implementer: each interface below lists ONLY the methods used by a
// current call site. When refactoring a consumer (Stage B), if you find a usage
// not covered here, ADD the method to the interface AND both nothing-else — keep
// the set minimal (YAGNI). The signatures here are the contract Plan 2's Postgres
// impl must satisfy.

export interface UserRepository {
  findById(id: string, tx?: TxContext): Promise<UserRecord | null>;
  findByIdSafe(id: string, tx?: TxContext): Promise<PublicUserRecord | null>;
  findByEmail(email: string, tx?: TxContext): Promise<UserRecord | null>;
  /** Full records for a set of emails (`email $in emails`). Order is not guaranteed. */
  findByEmails(emails: string[], tx?: TxContext): Promise<UserRecord[]>;
  /** Full records for a set of ids (`_id $in ids`). Order is not guaranteed. */
  findManyByIds(ids: string[], tx?: TxContext): Promise<UserRecord[]>;
  create(input: {
    email: string;
    passwordHash: string;
    phone: string;
    balance: number;
  }, tx?: TxContext): Promise<UserRecord>;
  setBalance(id: string, balance: number, tx?: TxContext): Promise<void>;
  setVerificationToken(id: string, hash: string | null, expiresAt: Date | null, tx?: TxContext): Promise<void>;
  markVerified(id: string, tx?: TxContext): Promise<void>;
  setPersonalDetails(id: string, personalDetailsId: string, tx?: TxContext): Promise<void>;
}

/**
 * Plain (non-Mongoose) criteria for the filtered/recent list queries. Consumers
 * pass these params; the repo builds the underlying driver query. `sort` is a
 * stable enum so the repo owns the index-friendly sort spec.
 */
export type TransactionListSort = "newest" | "oldest" | "amount_desc" | "amount_asc";

export type TransactionFilterCriteria = {
  ownerId: string;
  type?: "credit" | "debit";
  counterpartyEmail?: string;
  dateFrom?: Date;
  dateTo?: Date;
  minAmount?: number;
  maxAmount?: number;
  reasonContains?: string;
  sort?: TransactionListSort;
  limit: number;
};

export type TransactionRecentCriteria = {
  ownerId: string;
  type?: "credit" | "debit";
  counterpartyEmail?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit: number;
};

export interface TransactionRepository {
  createMany(entries: Array<Omit<TransactionRecord, "id" | "createdAt" | "updatedAt">>, tx?: TxContext): Promise<TransactionRecord[]>;
  listForOwner(input: { ownerId: string; counterpartyEmail?: string; page: number; limit: number }, tx?: TxContext): Promise<{ transactions: TransactionRecord[]; total: number }>;
  recentWithCounterparty(input: { ownerId: string; counterpartyEmail: string; limit: number }, tx?: TxContext): Promise<TransactionRecord[]>;
  getRelationshipStats(input: { ownerId: string; counterpartyEmail: string }, tx?: TxContext): Promise<{ totalSent: number; totalReceived: number; transactionCount: number; lastTransactionAt: Date | null }>;
  getDirectionalTotals(input: { ownerId: string; counterpartyEmail: string }, tx?: TxContext): Promise<{ creditTotal: number; creditCount: number; debitTotal: number; debitCount: number }>;
  /** Sum and count of debits in a day window (preflight daily-limit usage). */
  getDailyDebitUsage(input: { ownerId: string; dayStart: Date; dayEnd: Date }, tx?: TxContext): Promise<{ total: number; count: number }>;
  /** Single ledger entry owned by `ownerId`. Returns null for malformed or foreign ids. */
  findByIdForOwner(id: string, ownerId: string, tx?: TxContext): Promise<TransactionRecord | null>;
  /** Filtered list (search/stats family): typed criteria in, records out (repo builds the query). */
  listForOwnerFiltered(criteria: TransactionFilterCriteria, tx?: TxContext): Promise<TransactionRecord[]>;
  /** Recent list for an owner, newest-first, optionally scoped by type/counterparty/date window. */
  recentForOwner(criteria: TransactionRecentCriteria, tx?: TxContext): Promise<TransactionRecord[]>;
  /** Newest matching entry (limit-1 of recentForOwner); null when none match. */
  lastForOwner(criteria: Omit<TransactionRecentCriteria, "limit">, tx?: TxContext): Promise<TransactionRecord | null>;
  /** True when at least one debit from `ownerId` to `counterpartyEmail` exists. */
  hasDebitToCounterparty(input: { ownerId: string; counterpartyEmail: string }, tx?: TxContext): Promise<boolean>;
}

export interface PersonalDetailsRepository {
  findByUserId(userId: string, tx?: TxContext): Promise<PersonalDetailsRecord | null>;
  ensureForUser(userId: string, tx?: TxContext): Promise<PersonalDetailsRecord>;
  update(userId: string, patch: Partial<Omit<PersonalDetailsRecord, "id" | "userId" | "createdAt" | "updatedAt">>, tx?: TxContext): Promise<PersonalDetailsRecord | null>;
  /** Provided records for a set of user ids (counterparty name enrichment). */
  findProvidedByUserIds(userIds: string[], tx?: TxContext): Promise<PersonalDetailsRecord[]>;
  /** Provided records whose name matches (case-insensitive exact). `lastName`
   * omitted means match on first name only. `limit` caps the result (ambiguity
   * detection). Repo owns the case-insensitive match shape. */
  findProvidedByName(input: { firstName: string; lastName?: string; limit: number }, tx?: TxContext): Promise<PersonalDetailsRecord[]>;
}

export interface ExchangeRateRepository {
  latestForBase(baseCurrency: string, tx?: TxContext): Promise<ExchangeRateRecord | null>;
  findForDate(baseCurrency: string, validForDate: string, tx?: TxContext): Promise<ExchangeRateRecord | null>;
  upsertForDate(record: Omit<ExchangeRateRecord, "id" | "createdAt" | "updatedAt">, tx?: TxContext): Promise<ExchangeRateRecord>;
}

export interface AiConversationRepository {
  findByConversationId(userId: string, conversationId: string, tx?: TxContext): Promise<AiConversationRecord | null>;
  upsert(record: Omit<AiConversationRecord, "id" | "createdAt" | "updatedAt">, tx?: TxContext): Promise<AiConversationRecord>;
}

/**
 * Optional match guards for a conditional status update (the AI deny/confirm
 * predicate). When supplied, the underlying update only applies if the stored
 * doc still satisfies them — otherwise the method returns null (caller maps that
 * to a 409). `idempotencyKey`/`idempotencyResult` write a single keyed result
 * under `idempotencyResults` atomically with the status flip.
 */
export type AiPendingTransferStatusUpdate = {
  userId?: string;
  version?: number;
  expectedStatus?: AiPendingTransferRecord["status"];
  notExpired?: boolean;
  idempotencyKey?: string;
  idempotencyResult?: unknown;
  /** When set, also `$set`s the `supersededById` pointer alongside the status
   * flip (the modify/supersede path links the old doc to its replacement). */
  supersededById?: string;
};

export interface AiPendingTransferRepository {
  findById(id: string, tx?: TxContext): Promise<AiPendingTransferRecord | null>;
  findActiveForConversation(userId: string, conversationId: string, tx?: TxContext): Promise<AiPendingTransferRecord | null>;
  /** Active pending doc owned by `userId` (status=pending, not expired). Used to find
   * a transfer to update by id; null when missing/foreign/expired/not pending. */
  findActivePendingForUser(id: string, userId: string, conversationId: string, tx?: TxContext): Promise<AiPendingTransferRecord | null>;
  /** Active pending transfers for a user, newest-first, capped at `limit`.
   * When `conversationId` is given, scopes to that conversation. */
  listActivePendingForUser(input: { userId: string; conversationId?: string; limit: number }, tx?: TxContext): Promise<AiPendingTransferRecord[]>;
  create(input: Omit<AiPendingTransferRecord, "id" | "createdAt" | "updatedAt">, tx?: TxContext): Promise<AiPendingTransferRecord>;
  updateStatus(id: string, status: AiPendingTransferRecord["status"], update?: AiPendingTransferStatusUpdate, tx?: TxContext): Promise<AiPendingTransferRecord | null>;
  setIdempotencyResult(id: string, key: string, value: unknown, tx?: TxContext): Promise<void>;
}

export interface AiAuditLogRepository {
  create(input: Omit<AiAuditLogRecord, "id" | "createdAt" | "updatedAt">, tx?: TxContext): Promise<AiAuditLogRecord>;
}

export interface VideoSessionRepository {
  findById(id: string, tx?: TxContext): Promise<VideoSessionRecord | null>;
  findByRoomName(roomName: string, tx?: TxContext): Promise<VideoSessionRecord | null>;
  create(input: Omit<VideoSessionRecord, "id" | "createdAt" | "updatedAt">, tx?: TxContext): Promise<VideoSessionRecord>;
  update(id: string, patch: Partial<Omit<VideoSessionRecord, "id" | "createdAt" | "updatedAt">>, tx?: TxContext): Promise<VideoSessionRecord | null>;
  listForUser(userId: string, tx?: TxContext): Promise<VideoSessionRecord[]>;
  listForAgentQueue(input: { types: VideoSessionType[]; status?: VideoSessionStatus; limit: number }, tx?: TxContext): Promise<VideoSessionRecord[]>;
}

export interface VideoAuditLogRepository {
  create(input: Omit<VideoAuditLogRecord, "id" | "createdAt" | "updatedAt">, tx?: TxContext): Promise<VideoAuditLogRecord>;
}

export interface Repositories {
  users: UserRepository;
  transactions: TransactionRepository;
  personalDetails: PersonalDetailsRepository;
  exchangeRates: ExchangeRateRepository;
  aiConversations: AiConversationRepository;
  aiPendingTransfers: AiPendingTransferRepository;
  aiAuditLogs: AiAuditLogRepository;
  videoSessions: VideoSessionRepository;
  videoAuditLogs: VideoAuditLogRepository;
  runInTransaction<T>(fn: (tx: TxContext) => Promise<T>): Promise<T>;
}
