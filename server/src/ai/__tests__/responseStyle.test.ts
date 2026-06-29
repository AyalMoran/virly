import { assistantPersonalities } from "../assistants.js";
import {
  buildResponseStyleContext,
  collectAllKnownPersonalityPhrases,
  lintPersonalityUsage,
  resolveResponseSituation
} from "../responseStyle.js";

const knownPhrases = collectAllKnownPersonalityPhrases(assistantPersonalities);

test("response situation resolver keeps prepared pending and quoted transfers out of confirmed success", () => {
  expect(
    resolveResponseSituation({
      intent: "transfer_prepare",
      riskLevel: "medium",
      requiresConfirmation: true,
      transferStatus: "pending",
      toolSucceeded: true
    })
  ).toBe("transfer_prepare_needs_confirmation");
  expect(
    resolveResponseSituation({
      intent: "transfer_modify_pending",
      riskLevel: "medium",
      requiresConfirmation: true,
      transferStatus: "pending",
      toolSucceeded: true
    })
  ).toBe("transfer_modify_pending_success");
  expect(
    resolveResponseSituation({
      intent: "transfer_quote",
      riskLevel: "medium",
      toolSucceeded: true
    })
  ).toBe("transfer_quote_success");
});

test("response situation resolver only returns confirmed transfer success for backend-confirmed execution", () => {
  expect(
    resolveResponseSituation({
      intent: "pending_confirmation_status",
      riskLevel: "medium",
      transferStatus: "confirmed",
      requiresConfirmation: true,
      backendConfirmedExecution: false
    })
  ).toBe("transfer_status_success");
  expect(
    resolveResponseSituation({
      intent: "pending_confirmation_status",
      riskLevel: "low",
      transferStatus: "confirmed",
      requiresConfirmation: false,
      backendConfirmedExecution: true
    })
  ).toBe("transfer_confirmed_success");
});

test("response situation resolver separates missing details, insufficient funds, and security-sensitive requests", () => {
  expect(
    resolveResponseSituation({
      intent: "transfer_prepare",
      riskLevel: "medium",
      missingFields: ["amount"]
    })
  ).toBe("missing_required_transfer_details");
  expect(
    resolveResponseSituation({
      intent: "transfer_eligibility",
      riskLevel: "high",
      toolSucceeded: false,
      failureReason: "INSUFFICIENT_BALANCE"
    })
  ).toBe("insufficient_funds");
  expect(
    resolveResponseSituation({
      intent: "unsafe_request",
      riskLevel: "blocked",
      toolSucceeded: false
    })
  ).toBe("security_sensitive");
});

test("style context exposes only active situation phrases and blocks high-risk personality", () => {
  const oshri = assistantPersonalities.oshri;
  const balanceStyle = buildResponseStyleContext(
    oshri,
    "balance_inquiry_success",
    "low"
  );
  expect(balanceStyle.maxPersonalityPhrases).toBe(1);
  expect(balanceStyle.allowedPhrases.includes("בדקתי לך")).toBeTruthy();
  expect(!balanceStyle.allowedPhrases.includes("הכסף כבר בדרך")).toBeTruthy();

  const insufficientStyle = buildResponseStyleContext(
    oshri,
    "insufficient_funds",
    "high"
  );
  expect(insufficientStyle.maxPersonalityPhrases).toBe(0);
  expect(insufficientStyle.allowedPhrases).toStrictEqual([]);
  expect(insufficientStyle.forbiddenPhrases.includes("הכסף כבר בדרך")).toBeTruthy();
});

test("personality linter rejects out-of-context success phrases and over-budget usage", () => {
  const style = buildResponseStyleContext(
    assistantPersonalities.oshri,
    "balance_inquiry_success",
    "low"
  );
  const successPhrase = lintPersonalityUsage(
    "היתרה שלך מוצגת בכרטיס. הכסף כבר בדרך.",
    style,
    knownPhrases
  );
  expect(successPhrase.valid).toBe(false);
  expect(successPhrase.disallowedPhrases.includes("הכסף כבר בדרך")).toBeTruthy();

  const overBudget = lintPersonalityUsage(
    "בדקתי לך. החשבון מוסר שהיתרה מוצגת בכרטיס.",
    style,
    knownPhrases
  );
  expect(overBudget.valid).toBe(false);
  expect(overBudget.tooManyPersonalityPhrases).toBe(true);

  const valid = lintPersonalityUsage(
    "בדקתי לך. היתרה מוצגת בכרטיס.",
    style,
    knownPhrases
  );
  expect(valid.valid).toBe(true);
});
