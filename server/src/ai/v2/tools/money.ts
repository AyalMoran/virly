/**
 * Money-proposing v2 tools (design §5, §8).
 *
 * These PREPARE transfers — they call the injected preparation/modification
 * services to validate and build a confirmation *card* and record it in the
 * per-turn outcome. They never move money: there is no execute-transfer tool, and
 * `executeTransferWithSession` is reachable only from the human-confirmed resume
 * path (Phase 5, not wired here). Building a card is exactly what v1's
 * `transfer_prepare` does; no funds leave an account.
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { config } from "../../../config.js";
import { getToolDisplayData } from "../../toolResults.js";
import type { TransferDraft } from "../../state.js";
import { transferConfirmationBlock } from "../blocks.js";
import { statusWriter } from "../streamEvents.js";

/**
 * Enforce the per-transfer limit in the single money path (closes the v1 gap
 * where limits were informational). Returns a localized refusal message when the
 * amount is over the limit, otherwise null.
 */
function overPerTransferLimit(amount: number, locale: string): string | null {
  const limit = config.ai.perTransferLimit;
  if (amount > limit) {
    return locale === "he"
      ? `הסכום ₪${amount} חורג מהמגבלה לפעולה (₪${limit}). בקש/י סכום נמוך יותר.`
      : `₪${amount} is over the per-transfer limit of ₪${limit}. Ask the user for a lower amount.`;
  }
  return null;
}
import {
  baseToolContext,
  getConfigurable,
  minimalCounterpartyRef,
  type V2Configurable
} from "../toolContext.js";
import * as D from "./descriptions.js";

/** Resolve a free-text recipient query to an authoritative email via the executor. */
async function resolveRecipientEmail(
  cfg: V2Configurable,
  query: string
): Promise<string | undefined> {
  const executor = cfg.executors.resolveCounterpartyCandidates;
  if (!executor) {
    return undefined;
  }
  const result = await executor({ ...baseToolContext(cfg), message: query });
  const metaEmail = getToolDisplayData(result).metadata.counterpartyEmail;
  if (typeof metaEmail === "string") {
    return metaEmail;
  }
  const dataEmail = (result.data as { email?: string } | null)?.email;
  return typeof dataEmail === "string" ? dataEmail : undefined;
}

export const prepareTransferTool = tool(
  async (args, config) => {
    const cfg = getConfigurable(config);
    statusWriter(config)?.({ kind: "status", label: "Preparing your confirmation" });
    const service = cfg.transferPreparationService;
    if (!service) {
      return "Transfer preparation is unavailable right now.";
    }

    const overLimit = overPerTransferLimit(args.amount, cfg.locale);
    if (overLimit) {
      cfg.turnOutcome.clarification = {
        reason: "ambiguous_amount",
        message: overLimit,
        expectedReplyType: "amount"
      };
      return overLimit;
    }

    let recipientEmail = args.recipientEmail?.trim().toLowerCase();
    if (!recipientEmail && args.recipientQuery) {
      recipientEmail = await resolveRecipientEmail(cfg, args.recipientQuery);
    }

    const draft: TransferDraft = {
      recipientEmail: recipientEmail ?? null,
      recipientReference: args.recipientQuery ?? null,
      amount: args.amount,
      currency: "ILS",
      reason: args.reason ?? null
    };

    const result = await service({
      userId: cfg.userId,
      conversationId: cfg.conversationId,
      assistantId: cfg.assistantId,
      draft,
      resolvedCounterparty: recipientEmail
        ? minimalCounterpartyRef(recipientEmail)
        : undefined
    });

    if (result.status === "needs_clarification") {
      cfg.turnOutcome.clarification = {
        reason: recipientEmail ? "missing_amount" : "missing_recipient",
        message: result.message,
        expectedReplyType: recipientEmail ? "amount" : "recipient"
      };
      return `I can't prepare that yet: ${result.message}`;
    }

    cfg.turnOutcome.confirmation = result.confirmation;
    cfg.turnOutcome.uiBlocks.push(transferConfirmationBlock(result.confirmation));
    return (
      `Prepared a confirmation card: ₪${result.confirmation.amount} to ` +
      `${result.confirmation.recipientEmail} (card ${result.confirmation.id}). ` +
      `It is NOT sent — the user must click Confirm. Tell them to review and confirm.`
    );
  },
  {
    name: "prepareTransfer",
    description: D.PREPARE_TRANSFER_DESC,
    schema: z.object({
      recipientEmail: z
        .string()
        .optional()
        .describe("An email from the known list / findCounterparty / typed verbatim."),
      recipientQuery: z
        .string()
        .optional()
        .describe("The person's name/words if you don't have a resolved email."),
      amount: z.number().positive().describe("Positive amount in ILS."),
      reason: z.string().optional()
    })
  }
);

export const modifyPendingTransferTool = tool(
  async (args, config) => {
    const cfg = getConfigurable(config);
    const service = cfg.transferModificationService;
    const pending = cfg.pendingConfirmation;
    if (!service) {
      return "Transfer modification is unavailable right now.";
    }
    if (!pending) {
      return "There is no active confirmation card to modify. Prepare a transfer first.";
    }

    if (typeof args.amount === "number") {
      const overLimit = overPerTransferLimit(args.amount, cfg.locale);
      if (overLimit) {
        cfg.turnOutcome.clarification = {
          reason: "ambiguous_amount",
          message: overLimit,
          expectedReplyType: "amount"
        };
        return overLimit;
      }
    }

    let recipientEmail = args.recipientEmail?.trim().toLowerCase();
    if (!recipientEmail && args.recipientQuery) {
      recipientEmail = await resolveRecipientEmail(cfg, args.recipientQuery);
    }
    // The recipient carries over from the active card unless the user changed it.
    const effectiveRecipient = recipientEmail ?? pending.recipientEmail;

    const modificationDraft: TransferDraft = {
      amount: args.amount ?? null,
      recipientEmail: recipientEmail ?? null,
      recipientReference: args.recipientQuery ?? null,
      currency: "ILS",
      reason: args.reason ?? null
    };

    const result = await service({
      userId: cfg.userId,
      conversationId: cfg.conversationId,
      assistantId: cfg.assistantId,
      activePendingTransferId: pending.confirmationId,
      modificationDraft,
      resolvedCounterparty: minimalCounterpartyRef(effectiveRecipient)
    });

    if (result.status === "needs_clarification") {
      cfg.turnOutcome.clarification = {
        reason: "ambiguous_amount",
        message: result.message,
        expectedReplyType: "amount"
      };
      return `I can't update that yet: ${result.message}`;
    }

    cfg.turnOutcome.confirmation = result.confirmation;
    cfg.turnOutcome.supersededConfirmationId = result.supersededConfirmationId;
    cfg.turnOutcome.uiBlocks.push(transferConfirmationBlock(result.confirmation));
    return (
      `Updated the card: ₪${result.confirmation.amount} to ` +
      `${result.confirmation.recipientEmail} (card ${result.confirmation.id}, ` +
      `supersedes ${result.supersededConfirmationId}). Still NOT sent — ask the user to confirm.`
    );
  },
  {
    name: "modifyPendingTransfer",
    description: D.MODIFY_PENDING_TRANSFER_DESC,
    schema: z.object({
      amount: z.number().positive().optional(),
      recipientEmail: z.string().optional(),
      recipientQuery: z.string().optional(),
      reason: z.string().optional()
    })
  }
);

export const requestClarificationTool = tool(
  async (args, config) => {
    const cfg = getConfigurable(config);
    const expectedReplyType =
      args.reason === "missing_amount" || args.reason === "ambiguous_amount"
        ? "amount"
        : "recipient";
    cfg.turnOutcome.clarification = {
      reason: args.reason,
      message: args.question,
      expectedReplyType
    };
    return (
      `Registered a clarification request (${args.reason}). Now ask the user this, ` +
      `in their language: "${args.question}"`
    );
  },
  {
    name: "requestClarification",
    description:
      "Ask the user for a missing or ambiguous TRANSFER detail (recipient or amount) " +
      "before preparing a card. Call this whenever the user wants to send money but you " +
      "are missing the recipient or the amount, or a reference is ambiguous. A plain-text " +
      "question alone does NOT register a clarification — you MUST call this so the app " +
      "knows the turn is awaiting the user's answer. Then also write the question in your reply.",
    schema: z.object({
      reason: z.enum([
        "missing_recipient",
        "missing_amount",
        "ambiguous_recipient",
        "ambiguous_amount"
      ]),
      question: z
        .string()
        .describe("The short question to ask the user (also write it in your reply).")
    })
  }
);

export const cancelPendingTransferTool = tool(
  async (_args, config) => {
    const cfg = getConfigurable(config);
    const pending = cfg.pendingConfirmation;
    if (!pending) {
      return "There is no active confirmation card to cancel.";
    }
    cfg.turnOutcome.supersededConfirmationId = pending.confirmationId;
    return (
      `Discarded the pending confirmation card (${pending.confirmationId}). ` +
      `No money moved. Acknowledge the cancellation to the user.`
    );
  },
  {
    name: "cancelPendingTransfer",
    description: D.CANCEL_PENDING_TRANSFER_DESC,
    schema: z.object({})
  }
);

export const moneyTools = [
  prepareTransferTool,
  modifyPendingTransferTool,
  cancelPendingTransferTool,
  requestClarificationTool
];
