import {
  buildAiUserRequest,
  extractRequestSlots,
  normalizeUserMessage
} from "../messageNormalization.js";
import type { AssistantIntent } from "../state.js";

describe("normalizeUserMessage", () => {
  test("detects an English ltr message with a currency symbol and date word", () => {
    const result = normalizeUserMessage("Send $50 today");
    expect(result.detectedLanguages).toStrictEqual(["en"]);
    expect(result.direction).toBe("ltr");
    expect(result.containsHebrew).toBe(false);
    expect(result.containsCurrencySymbol).toBe(true);
    expect(result.containsDateExpression).toBe(true);
  });

  test("detects a Hebrew rtl message", () => {
    const result = normalizeUserMessage("שלח חמישים שקל");
    expect(result.detectedLanguages).toStrictEqual(["he"]);
    expect(result.direction).toBe("rtl");
    expect(result.containsHebrew).toBe(true);
  });

  test("flags a mixed-language message", () => {
    const result = normalizeUserMessage("send שקל now");
    expect(result.detectedLanguages).toStrictEqual(["mixed"]);
    expect(result.direction).toBe("mixed");
  });

  test("collapses repeated whitespace in normalizedText", () => {
    expect(normalizeUserMessage("  a   b  ").normalizedText).toBe("a b");
  });
});

describe("extractRequestSlots", () => {
  test("extracts amount, currency, recipient email, and direction", () => {
    const slots = extractRequestSlots(
      "send $50 to bob@example.com",
      "transfer_prepare" as AssistantIntent
    );
    expect(slots.amount?.value).toBe(50);
    expect(slots.amount?.currency).toBe("USD");
    expect(slots.amount?.currencySupported).toBe(false);
    expect(slots.counterparty?.explicitEmail).toBe("bob@example.com");
    expect(slots.transactionDirection).toBe("sent");
  });

  test("marks ILS as the only supported currency", () => {
    const slots = extractRequestSlots("100 shekel", "transfer_prepare" as AssistantIntent);
    expect(slots.amount?.currency).toBe("ILS");
    expect(slots.amount?.currencySupported).toBe(true);
  });

  test("detects a received direction", () => {
    const slots = extractRequestSlots(
      "how much money I received",
      "transaction_search" as AssistantIntent
    );
    expect(slots.transactionDirection).toBe("received");
  });
});

describe("buildAiUserRequest operation mapping", () => {
  function operationFor(intent: AssistantIntent) {
    const slots = extractRequestSlots("hello", intent);
    return buildAiUserRequest(normalizeUserMessage("hello"), slots).operation;
  }

  test("maps intents to operations", () => {
    expect(operationFor("unsafe_request" as AssistantIntent)).toBe("unsafe");
    expect(operationFor("transfer_prepare" as AssistantIntent)).toBe(
      "prepare_transfer"
    );
    expect(operationFor("transfer_modify_pending" as AssistantIntent)).toBe(
      "modify_pending_transfer"
    );
    expect(operationFor("general_help" as AssistantIntent)).toBe("help");
    expect(operationFor("balance_inquiry" as AssistantIntent)).toBe("read");
  });

  test("builds a literal amountRef and explicit-email counterpartyRef", () => {
    const slots = extractRequestSlots(
      "send 50 to bob@example.com",
      "transfer_prepare" as AssistantIntent
    );
    const request = buildAiUserRequest(
      normalizeUserMessage("send 50 to bob@example.com"),
      slots
    );
    expect(request.amountRef?.kind).toBe("literal");
    expect(request.amountRef?.value).toBe(50);
    expect(request.counterpartyRef?.kind).toBe("explicit_email");
    expect(request.counterpartyRef?.email).toBe("bob@example.com");
  });
});
