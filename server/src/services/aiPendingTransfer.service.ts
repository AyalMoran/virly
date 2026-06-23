import { getRepositories } from "../repositories/index.js";
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

  return getRepositories().runInTransaction(async (tx) => {
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

    await assertAiTransferWithinLimits(
      { senderId: input.userId, amount: owned.amount },
      tx
    );

    const transferResult = await executeTransferWithSession(
      {
        senderId: input.userId,
        recipientEmail: owned.recipientEmail,
        amount: owned.amount,
        reason: owned.reason
      },
      tx
    );

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
}
