import mongoose from "mongoose";
import { AiPendingTransfer } from "../models/AiPendingTransfer.js";
import { PersonalDetails } from "../models/PersonalDetails.js";
import { User } from "../models/User.js";
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

const PENDING_TRANSFER_TTL_MS = 10 * 60 * 1000;

type PendingTransferDocument = InstanceType<typeof AiPendingTransfer>;

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

function toConfirmation(
  pendingTransfer: PendingTransferDocument
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

  const query =
    lastName.length > 0
      ? {
          firstName: new RegExp(`^${escapeRegExp(firstName)}$`, "i"),
          lastName: new RegExp(`^${escapeRegExp(lastName)}$`, "i")
        }
      : {
          firstName: new RegExp(`^${escapeRegExp(firstName)}$`, "i")
        };

  const matches = await PersonalDetails.find({
    ...query,
    status: "provided"
  })
    .limit(2)
    .select("userId");

  if (matches.length !== 1) {
    return undefined;
  }

  const recipient = await User.findById(matches[0].userId).select("email");
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

  const [sender, recipient] = await Promise.all([
    User.findById(input.userId),
    User.findOne({ email: recipientEmail })
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

  const personalDetails = await PersonalDetails.findOne({
    userId: recipient._id
  });
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

async function createPendingTransfer(input: {
  userId: string;
  conversationId: string;
  assistantId: string;
  draft: ValidatedAiTransferDraft;
  supersedesId?: string;
  session?: mongoose.ClientSession;
}) {
  const [pendingTransfer] = await AiPendingTransfer.create(
    [
      {
        userId: input.userId,
        conversationId: input.conversationId,
        assistantId: input.assistantId,
        recipientEmail: input.draft.recipientEmail,
        recipientFirstName: input.draft.recipientFirstName,
        recipientLastName: input.draft.recipientLastName,
        amount: input.draft.amount,
        currency: "ILS",
        reason: input.draft.reason,
        status: "pending",
        supersedesId: input.supersedesId ?? null,
        expiresAt: new Date(Date.now() + PENDING_TRANSFER_TTL_MS)
      }
    ],
    {
      ordered: true,
      ...(input.session ? { session: input.session } : {})
    }
  );

  if (!pendingTransfer) {
    throw new Error("Could not create pending transfer.");
  }

  return pendingTransfer;
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

  const pendingTransfer = await createPendingTransfer({
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
  const oldPending = await AiPendingTransfer.findOne({
    _id: input.activePendingTransferId,
    userId: input.userId,
    conversationId: input.conversationId,
    status: "pending",
    expiresAt: { $gt: new Date() }
  });

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

  const session = await mongoose.startSession();

  try {
    let newPendingTransfer: PendingTransferDocument | undefined;

    await session.withTransaction(async () => {
      const lockedOldPending = await AiPendingTransfer.findOne({
        _id: input.activePendingTransferId,
        userId: input.userId,
        conversationId: input.conversationId,
        status: "pending",
        expiresAt: { $gt: new Date() }
      }).session(session);

      if (!lockedOldPending) {
        throw getStatusError();
      }

      newPendingTransfer = await createPendingTransfer({
        userId: input.userId,
        conversationId: input.conversationId,
        assistantId: input.assistantId,
        draft: validation.draft,
        supersedesId: lockedOldPending.id,
        session
      });

      lockedOldPending.status = "superseded";
      lockedOldPending.supersededById = newPendingTransfer._id;
      await lockedOldPending.save({ session });
    });

    if (!newPendingTransfer) {
      throw new Error("Could not update pending transfer.");
    }

    return {
      status: "ready",
      confirmation: toConfirmation(newPendingTransfer),
      supersededConfirmationId: input.activePendingTransferId
    };
  } finally {
    await session.endSession();
  }
}

export async function getResumablePendingForUser(
  pendingTransferId: string,
  userId: string
): Promise<PendingTransferDocument | null> {
  return AiPendingTransfer.findOne({
    _id: pendingTransferId,
    userId
  })
    .select("conversationId")
    .lean() as Promise<PendingTransferDocument | null>;
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
  const idempotencyPath = input.idempotencyKey
    ? `idempotencyResults.${input.idempotencyKey}`
    : undefined;

  if (input.action === "deny") {
    const current = await AiPendingTransfer.findOne({
      _id: input.pendingTransferId,
      userId: input.userId
    })
      .select("status supersededById")
      .lean();
    if (current?.status === "superseded") {
      throw getSupersededError(current.supersededById);
    }

    if (input.idempotencyKey) {
      const existing = await AiPendingTransfer.findOne({
        _id: input.pendingTransferId,
        userId: input.userId,
        [idempotencyPath as string]: { $exists: true }
      }).lean();
      const previous = readIdempotencyResult(
        existing?.idempotencyResults,
        input.idempotencyKey
      );
      if (previous) {
        return previous;
      }
    }

    const denied = await AiPendingTransfer.findOneAndUpdate(
      {
        _id: input.pendingTransferId,
        userId: input.userId,
        version: input.version,
        status: "pending",
        expiresAt: { $gt: new Date() }
      },
      {
        $set: {
          status: "denied",
          ...(idempotencyPath
            ? {
                [idempotencyPath]: {
                  status: "denied",
                  message: "Transfer cancelled."
                }
              }
            : {})
        }
      },
      { new: true }
    );

    if (!denied) {
      throw getStatusError();
    }

    return {
      status: "denied",
      message: "Transfer cancelled."
    };
  }

  const session = await mongoose.startSession();

  try {
    let result: AiConfirmationResult | undefined;

    await session.withTransaction(async () => {
      const current = await AiPendingTransfer.findOne({
        _id: input.pendingTransferId,
        userId: input.userId
      })
        .select("status supersededById")
        .session(session);
      if (current?.status === "superseded") {
        throw getSupersededError(current.supersededById);
      }

      if (input.idempotencyKey) {
        const existing = await AiPendingTransfer.findOne({
          _id: input.pendingTransferId,
          userId: input.userId,
          [idempotencyPath as string]: { $exists: true }
        }).session(session);
        const previous = readIdempotencyResult(
          existing?.idempotencyResults,
          input.idempotencyKey
        );
        if (previous) {
          result = previous;
          return;
        }
      }

      const pendingTransfer = await AiPendingTransfer.findOne({
        _id: input.pendingTransferId,
        userId: input.userId,
        version: input.version,
        status: "pending",
        expiresAt: { $gt: new Date() }
      }).session(session);

      if (!pendingTransfer) {
        throw getStatusError();
      }

      await assertAiTransferWithinLimits(
        { senderId: input.userId, amount: pendingTransfer.amount },
        session
      );

      const transferResult = await executeTransferWithSession(
        {
          senderId: input.userId,
          recipientEmail: pendingTransfer.recipientEmail,
          amount: pendingTransfer.amount,
          reason: pendingTransfer.reason
        },
        session
      );

      result = {
        status: "confirmed",
        message: transferResult.message,
        newBalance: transferResult.newBalance,
        transaction: transferResult.transaction
      };
      pendingTransfer.status = "confirmed";
      if (input.idempotencyKey) {
        pendingTransfer.set(`idempotencyResults.${input.idempotencyKey}`, result);
      }
      await pendingTransfer.save({ session });
    });

    if (!result) {
      throw new Error("Transfer confirmation failed.");
    }

    return result;
  } finally {
    await session.endSession();
  }
}
