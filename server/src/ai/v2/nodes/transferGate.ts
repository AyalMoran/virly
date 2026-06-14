/**
 * `transferGate` — native human-in-the-loop pause (design §8 / Phase 5).
 *
 * Reached only in the resumable production graph after a card was prepared. It
 * calls `interrupt({ type, card })`, which pauses the graph and checkpoints its
 * state; the API surfaces the card and returns. When the authenticated
 * `POST /api/ai/confirmations/:id` resumes with `Command({ resume })`, this node
 * re-runs and `interrupt()` returns the user's decision, routing to
 * `executeTransfer` (confirm) or `persist` (deny). This is the ONLY path that can
 * reach money execution — no model token can.
 */
import { Command, interrupt } from "@langchain/langgraph";

import type { V2AgentStateType } from "../state.js";

export type TransferResumePayload = {
  action: "confirm" | "deny";
  version: number;
  idempotencyKey?: string;
};

export function transferGateNode(state: V2AgentStateType): Command {
  const card = state.confirmation;
  const decision = interrupt({
    type: "transfer_confirmation",
    card
  }) as TransferResumePayload;

  if (decision.action === "confirm") {
    return new Command({
      goto: "executeTransfer",
      update: {
        confirmationOutcome: "confirmed",
        resumeMeta: {
          version: decision.version ?? card?.version ?? 1,
          idempotencyKey: decision.idempotencyKey
        }
      }
    });
  }

  return new Command({
    goto: "persist",
    update: {
      confirmationOutcome: "denied",
      confirmation: undefined,
      responseMessage: "Okay — I won't send that. The transfer was cancelled."
    }
  });
}
