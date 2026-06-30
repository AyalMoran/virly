import { getRepositories } from "../repositories/index.js";
import { config } from "../config.js";
import { recordTransferRiskFlag, scoreTransfer } from "../fraud/service.js";
import { cancelHold, createHold, shouldHold } from "../fraud/holds.js";
import { sendTransferHoldEmail } from "./email.service.js";
import type {
  ModifyPendingTransferConfirmationInput,
  ModifyPendingTransferConfirmationResult,
  PrepareTransferConfirmationInput,
  PrepareTransferConfirmationResult,
  TransferDraft,
  TransferConfirmation
} from "../ai/state.js";
import {
  assertAiTransferWithinLimits,
  executeTransferWithSession,
  notifyTransferReceived,
  type ExecuteTransferResult
} from "./transfer.service.js";
import type { AiPendingTransferRecord, TxContext } from "../repositories/types.js";

const PENDING_TRANSFER_TTL_MS = 10 * 60 * 1000;

export type AiConfirmationAction = "confirm" | "deny";

export type AiConfirmationResult =
  | {
      status: "confirmed";
      message: string;
      newBalance: number;
      transaction: ExecuteTransferResult["transaction"];
    }
  | {
      status: "denied";
      message: string;
    }
  | {
      status: "held";
      message: string;
      heldId: string;
      level: string;
      reasons: string[];
      expiresAt: string;
    };

type ValidatedAiTransferDraft = {
  recipientEmail: string;
  recipientFirstName: string | null;
  recipientLastName: string | null;
  amount: number;
  reason: string | null;
};

/** Fields `toConfirmation` reads — satisfied by the repo record (the only
 * source now that every persistence path returns a POJO record). */
type ConfirmationSource = {
  id: string;
  version?: number | null;
  recipientEmail: string;
  recipientFirstName: string | null;
  recipientLastName: string | null;
  amount: number;
  reason: string | null;
  supersedesId: { toString(): string } | string | null;
  expiresAt: Date;
};

function toConfirmation(
  pendingTransfer: ConfirmationSource
): TransferConfirmation {
  const recipientFirstName = pendingTransfer.recipientFirstName ?? null;
  const recipientLastName = pendingTransfer.recipientLastName ?? null;
  const displayName =
    [recipientFirstName, recipientLastName].filter(Boolean).join(" ") ||
    pendingTransfer.recipientEmail;
  const version = pendingTransfer.version ?? 1;
  const path = `/api/ai/confirmations/${pendingTransfer.id}`;

  return {
    id: pendingTransfer.id,
    version,
    type: "transfer",
    status: "pending",
    recipientEmail: pendingTransfer.recipientEmail,
    recipientFirstName,
    recipientLastName,
    amount: pendingTransfer.amount,
    currency: "ILS",
    recipient: {
      email: pendingTransfer.recipientEmail,
      firstName: recipientFirstName,
      lastName: recipientLastName,
      displayName,
      verified: Boolean(recipientFirstName || recipientLastName)
    },
    amountDetails: {
      value: pendingTransfer.amount,
      currency: "ILS",
      formatted: new Intl.NumberFormat("he-IL", {
        style: "currency",
        currency: "ILS"
      }).format(pendingTransfer.amount)
    },
    reason: pendingTransfer.reason ?? null,
    supersedesId: pendingTransfer.supersedesId
      ? pendingTransfer.supersedesId.toString()
      : null,
    warnings:
      recipientFirstName || recipientLastName
        ? []
        : [
            {
              code: "MISSING_RECIPIENT_NAME",
              message: "Recipient profile name is not provided."
            }
          ],
    expiresAt: pendingTransfer.expiresAt.toISOString(),
    confirmAction: {
      method: "POST",
      path,
      body: {
        action: "confirm",
        version
      }
    },
    denyAction: {
      method: "POST",
      path,
      body: {
        action: "deny",
        version
      }
    }
  };
}

function getStatusError() {
  return Object.assign(
    new Error("This transfer confirmation is no longer available."),
    { status: 409 }
  );
}

function getSupersededError(supersededById?: unknown) {
  return Object.assign(
    new Error(
      "This transfer confirmation was replaced by a newer one. Please review and confirm the latest transfer card."
    ),
    {
      status: 409,
      error: "confirmation_superseded",
      supersededById: supersededById ? String(supersededById) : undefined
    }
  );
}

function readIdempotencyResult(
  source: unknown,
  key: string
): AiConfirmationResult | undefined {
  const results = source as
    | Map<string, AiConfirmationResult>
    | Record<string, AiConfirmationResult>
    | undefined;

  if (!results) {
    return undefined;
  }

  if (results instanceof Map) {
    return results.get(key);
  }

  return results[key];
}

async function resolveRecipientEmailFromName(reference?: string | null) {
  const normalized = reference?.trim();
  if (!normalized || normalized.length > 80) {
    return undefined;
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ");
  if (!firstName) {
    return undefined;
  }

  const matches = await getRepositories().personalDetails.findProvidedByName({
    firstName,
    lastName: lastName.length > 0 ? lastName : undefined,
    limit: 2
  });

  if (matches.length !== 1) {
    return undefined;
  }

  const recipient = await getRepositories().users.findById(matches[0].userId);
  return recipient?.email;
}

async function validateAiTransferDraft(input: {
  userId: string;
  draft: TransferDraft;
}): Promise<
  | {
      status: "ready";
      draft: ValidatedAiTransferDraft;
    }
  | {
      status: "needs_clarification";
      message: string;
    }
> {
  const recipientEmail = (
    input.draft.recipientEmail ??
    (await resolveRecipientEmailFromName(input.draft.recipientReference)) ??
    ""
  )
    .trim()
    .toLowerCase();
  const amount = input.draft.amount;

  if (!recipientEmail && !amount) {
    return {
      status: "needs_clarification",
      message:
        "I need a recipient and an amount before I can prepare that transfer."
    };
  }

  if (!recipientEmail) {
    return {
      status: "needs_clarification",
      message:
        "I need to know which recipient you mean before I can prepare that transfer."
    };
  }

  if (!amount || !Number.isFinite(amount) || amount <= 0) {
    return {
      status: "needs_clarification",
      message:
        "I need a valid positive amount before I can prepare that transfer."
    };
  }

  const repos = getRepositories();
  const [sender, recipient] = await Promise.all([
    repos.users.findById(input.userId),
    repos.users.findByEmail(recipientEmail)
  ]);

  if (!sender) {
    return {
      status: "needs_clarification",
      message: "I could not find your sender account."
    };
  }

  if (!recipient) {
    return {
      status: "needs_clarification",
      message:
        "I could not find that recipient as a Virly user. Please choose an existing recipient email."
    };
  }

  if (sender.email === recipient.email) {
    return {
      status: "needs_clarification",
      message: "You cannot transfer money to yourself."
    };
  }

  if (sender.balance < amount) {
    return {
      status: "needs_clarification",
      message: "Your current balance is not enough for that transfer."
    };
  }

  const personalDetails = await repos.personalDetails.findByUserId(
    recipient.id
  );
  const hasProvidedDetails = personalDetails?.status === "provided";

  return {
    status: "ready",
    draft: {
      recipientEmail: recipient.email,
      recipientFirstName: hasProvidedDetails
        ? personalDetails.firstName ?? null
        : null,
      recipientLastName: hasProvidedDetails
        ? personalDetails.lastName ?? null
        : null,
      amount,
      reason: input.draft.reason?.trim() || null
    }
  };
}

type CreatePendingTransferInput = {
  userId: string;
  conversationId: string;
  assistantId: string;
  draft: ValidatedAiTransferDraft;
  supersedesId?: string;
};

/** Shared persistence shape for a new pending transfer (TTL applied here). */
function buildPendingTransferFields(input: CreatePendingTransferInput) {
  return {
    userId: input.userId,
    conversationId: input.conversationId,
    assistantId: input.assistantId,
    recipientEmail: input.draft.recipientEmail,
    recipientFirstName: input.draft.recipientFirstName,
    recipientLastName: input.draft.recipientLastName,
    amount: input.draft.amount,
    currency: "ILS" as const,
    reason: input.draft.reason,
    status: "pending" as const,
    supersedesId: input.supersedesId ?? null,
    expiresAt: new Date(Date.now() + PENDING_TRANSFER_TTL_MS)
  };
}

/** Repo-backed create. Returns a record. Pass `tx` to enlist in a transaction
 * (the modify/supersede path); omit it for the standalone (prepare) path. */
async function createPendingTransferRecord(
  input: CreatePendingTransferInput,
  tx?: TxContext
): Promise<AiPendingTransferRecord> {
  return getRepositories().aiPendingTransfers.create(
    {
      ...buildPendingTransferFields(input),
      version: 1,
      supersededById: null,
      idempotencyResults: {}
    },
    tx
  );
}

export async function prepareAiPendingTransfer(
  input: PrepareTransferConfirmationInput
): Promise<PrepareTransferConfirmationResult> {
  const validation = await validateAiTransferDraft({
    userId: input.userId,
    draft: {
      ...input.draft,
      recipientEmail: input.draft.recipientEmail ?? input.resolvedCounterparty?.email
    }
  });

  if (validation.status === "needs_clarification") {
    return validation;
  }

  const pendingTransfer = await createPendingTransferRecord({
    userId: input.userId,
    conversationId: input.conversationId,
    assistantId: input.assistantId,
    draft: validation.draft
  });

  return {
    status: "ready",
    confirmation: toConfirmation(pendingTransfer)
  };
}

export async function modifyAiPendingTransfer(
  input: ModifyPendingTransferConfirmationInput
): Promise<ModifyPendingTransferConfirmationResult> {
  const oldPending = await getRepositories().aiPendingTransfers.findActivePendingForUser(
    input.activePendingTransferId,
    input.userId,
    input.conversationId
  );

  if (!oldPending) {
    return {
      status: "needs_clarification",
      message:
        "I do not see an active pending transfer to update. Please prepare a new transfer."
    };
  }

  const validation = await validateAiTransferDraft({
    userId: input.userId,
    draft: {
      recipientEmail:
        input.modificationDraft.recipientEmail ??
        input.resolvedCounterparty?.email ??
        oldPending.recipientEmail,
      recipientReference: input.modificationDraft.recipientReference,
      amount: input.modificationDraft.amount ?? oldPending.amount,
      reason:
        input.modificationDraft.reason !== undefined
          ? input.modificationDraft.reason
          : oldPending.reason
    }
  });

  if (validation.status === "needs_clarification") {
    return validation;
  }

  return getRepositories().runInTransaction(async (tx) => {
    const repos = getRepositories();

    // Re-read the old pending under the transaction with the SAME guards the
    // model query used (own/pending/not-expired) so a concurrent confirm/deny
    // between validation and here is caught.
    const lockedOldPending = await repos.aiPendingTransfers.findActivePendingForUser(
      input.activePendingTransferId,
      input.userId,
      input.conversationId,
      tx
    );

    if (!lockedOldPending) {
      throw getStatusError();
    }

    const newPendingTransfer = await createPendingTransferRecord(
      {
        userId: input.userId,
        conversationId: input.conversationId,
        assistantId: input.assistantId,
        draft: validation.draft,
        supersedesId: lockedOldPending.id
      },
      tx
    );

    // Link + retire the old card atomically with the new one's creation.
    const superseded = await repos.aiPendingTransfers.updateStatus(
      lockedOldPending.id,
      "superseded",
      { supersededById: newPendingTransfer.id },
      tx
    );

    if (!superseded) {
      throw new Error("Could not update pending transfer.");
    }

    return {
      status: "ready",
      confirmation: toConfirmation(newPendingTransfer),
      supersededConfirmationId: input.activePendingTransferId
    };
  });
}

export async function getResumablePendingForUser(
  pendingTransferId: string,
  userId: string
): Promise<{ conversationId: string } | null> {
  const record = await getRepositories().aiPendingTransfers.findById(
    pendingTransferId
  );
  // Preserve the original `{ _id, userId }` ownership scoping.
  if (!record || record.userId !== userId) {
    return null;
  }
  return { conversationId: record.conversationId };
}

export async function respondToAiPendingTransfer(
  input: {
    userId: string;
    pendingTransferId: string;
    action: AiConfirmationAction;
    version: number;
    idempotencyKey?: string;
  }
): Promise<AiConfirmationResult> {
  const repos = getRepositories();

  if (input.action === "deny") {
    const current = await repos.aiPendingTransfers.findById(input.pendingTransferId);
    // Preserve the original `{ _id, userId }` ownership scoping.
    const owned = current && current.userId === input.userId ? current : null;
    if (owned?.status === "superseded") {
      throw getSupersededError(owned.supersededById);
    }

    if (input.idempotencyKey) {
      const previous = readIdempotencyResult(
        owned?.idempotencyResults,
        input.idempotencyKey
      );
      if (previous) {
        return previous;
      }
    }

    const denied = await repos.aiPendingTransfers.updateStatus(
      input.pendingTransferId,
      "denied",
      {
        userId: input.userId,
        version: input.version,
        expectedStatus: "pending",
        notExpired: true,
        ...(input.idempotencyKey
          ? {
              idempotencyKey: input.idempotencyKey,
              idempotencyResult: {
                status: "denied",
                message: "Transfer cancelled."
              }
            }
          : {})
      }
    );

    if (!denied) {
      throw getStatusError();
    }

    return {
      status: "denied",
      message: "Transfer cancelled."
    };
  }

  // Fraud hold gate: when enabled, a risky AI transfer is held for email
  // confirmation instead of executing on card-confirm. Planned BEFORE the tx
  // (scoring reads are not part of the money transaction); any failure leaves
  // holdPlan null so the confirm proceeds normally (never blocks a transfer).
  let holdPlan:
    | {
        heldId: string;
        token: string;
        expiresAt: Date;
        recipientEmail: string;
        amount: number;
        level: string;
        reasons: string[];
        senderEmail: string;
      }
    | null = null;
  if (config.fraud.holdLevel !== "off") {
    try {
      const pre = await repos.aiPendingTransfers.findById(input.pendingTransferId);
      const owned = pre && pre.userId === input.userId && pre.status === "pending" ? pre : null;
      if (owned) {
        const risk = await scoreTransfer({
          userId: input.userId,
          recipientEmail: owned.recipientEmail,
          amount: owned.amount,
          alreadyExecuted: false
        });
        const sender = await repos.users.findById(input.userId);
        if (shouldHold(risk.level) && sender) {
          const hold = await createHold({
            userId: input.userId,
            recipientEmail: owned.recipientEmail,
            amount: owned.amount,
            currency: "ILS",
            reason: owned.reason,
            score: risk.score,
            level: risk.level,
            reasons: risk.reasons
          });
          holdPlan = {
            heldId: hold.id,
            token: hold.token,
            expiresAt: hold.expiresAt,
            recipientEmail: owned.recipientEmail,
            amount: owned.amount,
            level: risk.level,
            reasons: risk.reasons,
            senderEmail: sender.email
          };
        }
      }
    } catch (error) {
      // Fail-open: a scoring/hold-store failure degrades to a normal confirm so a
      // legitimate transfer is never blocked — but it MUST be observable, since the
      // fraud control is disabling itself. (Posture: fail-open + logged.)
      console.error(
        "[fraud] AI confirm hold gate degraded to normal execution:",
        error instanceof Error ? error.message : error
      );
      holdPlan = null;
    }
  }
  const heldClaim = { done: false };

  const flag: {
    value: {
      recipientEmail: string;
      amount: number;
      reason?: string | null;
      transactionId?: string;
    } | null;
  } = { value: null };
  let confirmResult: AiConfirmationResult;
  try {
    confirmResult = await getRepositories().runInTransaction(async (tx) => {
    // One read under the transaction serves the superseded check, the
    // idempotency replay, and the optimistic lock — snapshot isolation makes
    // the original three identical `_id`/`userId`-scoped reads equivalent.
    const current = await repos.aiPendingTransfers.findById(
      input.pendingTransferId,
      tx
    );
    // Preserve the original `{ _id, userId }` ownership scoping.
    const owned =
      current && current.userId === input.userId ? current : null;

    if (owned?.status === "superseded") {
      throw getSupersededError(owned.supersededById);
    }

    if (input.idempotencyKey) {
      const previous = readIdempotencyResult(
        owned?.idempotencyResults,
        input.idempotencyKey
      );
      if (previous) {
        return previous;
      }
    }

    // Optimistic lock: same guards as the original lock query
    // (own/version/pending/not-expired). Any mismatch is a 409.
    if (
      !owned ||
      owned.version !== input.version ||
      owned.status !== "pending" ||
      owned.expiresAt.getTime() <= Date.now()
    ) {
      throw getStatusError();
    }

    // Enforce AI per-transfer/daily limits BEFORE the hold decision too, so a
    // held transfer (the deferred execution skips this check) can't bypass them.
    await assertAiTransferWithinLimits(
      { senderId: input.userId, amount: owned.amount },
      tx
    );

    // HOLD path: don't move money. Claim the card (pending -> confirmed) atomically
    // with the held result as the idempotency payload, then the email link drives
    // the actual execution. The hold row was created pre-tx; the post-tx handler
    // emails it (on a winning claim) or cancels it (on a replay/loss).
    if (holdPlan) {
      const heldResult: AiConfirmationResult = {
        status: "held",
        heldId: holdPlan.heldId,
        level: holdPlan.level,
        reasons: holdPlan.reasons,
        expiresAt: holdPlan.expiresAt.toISOString(),
        message: "This transfer was held for review. Confirm it from the email we sent you."
      };
      // Distinct 'held' status (not 'confirmed'): the card is consumed but the
      // money has NOT moved — the held_transfers row tracks the real execution.
      const claimed = await repos.aiPendingTransfers.updateStatus(
        input.pendingTransferId,
        "held",
        {
          userId: input.userId,
          version: input.version,
          expectedStatus: "pending",
          notExpired: true,
          ...(input.idempotencyKey
            ? { idempotencyKey: input.idempotencyKey, idempotencyResult: heldResult }
            : {})
        },
        tx
      );
      if (!claimed) {
        throw getStatusError();
      }
      heldClaim.done = true;
      return heldResult;
    }

    const transferResult = await executeTransferWithSession(
      {
        senderId: input.userId,
        recipientEmail: owned.recipientEmail,
        amount: owned.amount,
        reason: owned.reason
      },
      tx
    );

    // Captured for a post-commit fraud flag + realtime notify (after the tx settles).
    flag.value = {
      recipientEmail: owned.recipientEmail,
      amount: owned.amount,
      reason: owned.reason,
      transactionId: transferResult.transaction?.id ?? undefined
    };

    const result: AiConfirmationResult = {
      status: "confirmed",
      message: transferResult.message,
      newBalance: transferResult.newBalance,
      transaction: transferResult.transaction
    };

    // Flip to "confirmed" (and persist the idempotency result) atomically with
    // the settlement above. The guards re-apply the optimistic lock at write
    // time; a null result means the doc changed under us -> 409.
    const confirmed = await repos.aiPendingTransfers.updateStatus(
      input.pendingTransferId,
      "confirmed",
      {
        userId: input.userId,
        version: input.version,
        expectedStatus: "pending",
        notExpired: true,
        ...(input.idempotencyKey
          ? {
              idempotencyKey: input.idempotencyKey,
              idempotencyResult: result
            }
          : {})
      },
      tx
    );

    if (!confirmed) {
      throw getStatusError();
    }

      return result;
    });
  } catch (error) {
    // The tx failed/rolled back; cancel an unclaimed hold row we created pre-tx.
    if (holdPlan && !heldClaim.done) {
      await cancelHold(holdPlan.heldId, holdPlan.token).catch(() => {});
    }
    throw error;
  }

  // Held path: email the sender on a winning claim; cancel an orphan on a replay.
  if (holdPlan) {
    if (heldClaim.done) {
      const reviewUrl = `${config.serverUrl}/api/transactions/held/confirm?id=${holdPlan.heldId}&token=${holdPlan.token}`;
      try {
        await sendTransferHoldEmail(holdPlan.senderEmail, {
          amount: holdPlan.amount,
          currency: "ILS",
          recipientEmail: holdPlan.recipientEmail,
          reasons: holdPlan.reasons,
          reviewUrl
        });
      } catch {
        // The email service logs the links on failure; never fail the request.
      }
    } else {
      await cancelHold(holdPlan.heldId, holdPlan.token).catch(() => {});
    }
  }

  // Post-commit, best-effort fraud flag + realtime notify — only when a transfer
  // actually executed (flag.value is set only on the money-moving path, never held).
  if (flag.value) {
    await recordTransferRiskFlag({
      userId: input.userId,
      recipientEmail: flag.value.recipientEmail,
      amount: flag.value.amount,
      transactionId: flag.value.transactionId,
      alreadyExecuted: true
    });
    await notifyTransferReceived({
      recipientEmail: flag.value.recipientEmail,
      amount: flag.value.amount,
      reason: flag.value.reason
    });
  }
  return confirmResult;
}
