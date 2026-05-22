import mongoose from "mongoose";
import { AiPendingTransfer } from "../models/AiPendingTransfer.js";
import { PersonalDetails } from "../models/PersonalDetails.js";
import { User } from "../models/User.js";
import type {
  PrepareTransferConfirmationInput,
  PrepareTransferConfirmationResult,
  TransferConfirmation
} from "../ai/state.js";
import {
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

function toConfirmation(
  pendingTransfer: PendingTransferDocument
): TransferConfirmation {
  return {
    id: pendingTransfer.id,
    type: "transfer",
    recipientEmail: pendingTransfer.recipientEmail,
    recipientFirstName: pendingTransfer.recipientFirstName ?? null,
    recipientLastName: pendingTransfer.recipientLastName ?? null,
    amount: pendingTransfer.amount,
    reason: pendingTransfer.reason ?? null,
    expiresAt: pendingTransfer.expiresAt.toISOString()
  };
}

function getStatusError() {
  return Object.assign(
    new Error("This transfer confirmation is no longer available."),
    { status: 409 }
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

export async function prepareAiPendingTransfer(
  input: PrepareTransferConfirmationInput
): Promise<PrepareTransferConfirmationResult> {
  const recipientEmail = (
    input.draft.recipientEmail ??
    input.resolvedCounterparty?.email ??
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
  const pendingTransfer = await AiPendingTransfer.create({
    userId: input.userId,
    conversationId: input.conversationId,
    assistantId: input.assistantId,
    recipientEmail: recipient.email,
    recipientFirstName: hasProvidedDetails
      ? personalDetails.firstName ?? null
      : null,
    recipientLastName: hasProvidedDetails
      ? personalDetails.lastName ?? null
      : null,
    amount,
    reason: input.draft.reason?.trim() || null,
    status: "pending",
    expiresAt: new Date(Date.now() + PENDING_TRANSFER_TTL_MS)
  });

  return {
    status: "ready",
    confirmation: toConfirmation(pendingTransfer)
  };
}

export async function respondToAiPendingTransfer(
  input: {
    userId: string;
    pendingTransferId: string;
    action: AiConfirmationAction;
  }
): Promise<AiConfirmationResult> {
  if (input.action === "deny") {
    const denied = await AiPendingTransfer.findOneAndUpdate(
      {
        _id: input.pendingTransferId,
        userId: input.userId,
        status: "pending",
        expiresAt: { $gt: new Date() }
      },
      { $set: { status: "denied" } },
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
      const pendingTransfer = await AiPendingTransfer.findOne({
        _id: input.pendingTransferId,
        userId: input.userId,
        status: "pending",
        expiresAt: { $gt: new Date() }
      }).session(session);

      if (!pendingTransfer) {
        throw getStatusError();
      }

      const transferResult = await executeTransferWithSession(
        {
          senderId: input.userId,
          recipientEmail: pendingTransfer.recipientEmail,
          amount: pendingTransfer.amount,
          reason: pendingTransfer.reason
        },
        session
      );

      pendingTransfer.status = "confirmed";
      await pendingTransfer.save({ session });

      result = {
        status: "confirmed",
        message: transferResult.message,
        newBalance: transferResult.newBalance,
        transaction: transferResult.transaction
      };
    });

    if (!result) {
      throw new Error("Transfer confirmation failed.");
    }

    return result;
  } finally {
    await session.endSession();
  }
}
