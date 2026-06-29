/**
 * Approximate, dependency-free token counting for the summarization view.
 *
 * A langmem-style summarizer needs a token budget, not a message count. We avoid
 * pulling a tokenizer dependency (js-tiktoken) by approximating ~4 chars/token —
 * deterministic, fast, and good enough to bound the context window. Swap in an
 * exact counter later behind the same signatures if precision is ever needed.
 */
import type { BaseMessage } from "@langchain/core/messages";

/** ~4 characters per token (OpenAI-ish English heuristic), rounded up. */
export function approximateTokens(text: string): number {
  if (!text) {
    return 0;
  }
  return Math.ceil(text.length / 4);
}

/** Flatten string-or-parts message content to plain text. */
function plainText(message: BaseMessage): string {
  const { content } = message;
  if (typeof content === "string") {
    return content;
  }
  return content
    .map((part) =>
      typeof part === "string"
        ? part
        : "text" in part && typeof part.text === "string"
          ? part.text
          : ""
    )
    .join("");
}

/** Content tokens plus a small fixed per-message overhead (role/formatting). */
export function messageTokens(message: BaseMessage): number {
  return 4 + approximateTokens(plainText(message));
}

export function countMessageTokens(messages: BaseMessage[]): number {
  return messages.reduce((sum, message) => sum + messageTokens(message), 0);
}
