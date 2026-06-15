import assert from "node:assert/strict";
import test from "node:test";
import { assistantPersonalities } from "./assistants.js";
import {
  buildResponseStyleContext,
  collectAllKnownPersonalityPhrases,
  lintPersonalityUsage,
  resolveResponseSituation
} from "./responseStyle.js";

const knownPhrases = collectAllKnownPersonalityPhrases(assistantPersonalities);

test("response situation resolver keeps prepared pending and quoted transfers out of confirmed success", () => {
  assert.equal(
    resolveResponseSituation({
      intent: "transfer_prepare",
      riskLevel: "medium",
      requiresConfirmation: true,
      transferStatus: "pending",
      toolSucceeded: true
    }),
    "transfer_prepare_needs_confirmation"
  );
  assert.equal(
    resolveResponseSituation({
      intent: "transfer_modify_pending",
      riskLevel: "medium",
      requiresConfirmation: true,
      transferStatus: "pending",
      toolSucceeded: true
    }),
    "transfer_modify_pending_success"
  );
  assert.equal(
    resolveResponseSituation({
      intent: "transfer_quote",
      riskLevel: "medium",
      toolSucceeded: true
    }),
    "transfer_quote_success"
  );
});

test("response situation resolver only returns confirmed transfer success for backend-confirmed execution", () => {
  assert.equal(
    resolveResponseSituation({
      intent: "pending_confirmation_status",
      riskLevel: "medium",
      transferStatus: "confirmed",
      requiresConfirmation: true,
      backendConfirmedExecution: false
    }),
    "transfer_status_success"
  );
  assert.equal(
    resolveResponseSituation({
      intent: "pending_confirmation_status",
      riskLevel: "low",
      transferStatus: "confirmed",
      requiresConfirmation: false,
      backendConfirmedExecution: true
    }),
    "transfer_confirmed_success"
  );
});

test("response situation resolver separates missing details, insufficient funds, and security-sensitive requests", () => {
  assert.equal(
    resolveResponseSituation({
      intent: "transfer_prepare",
      riskLevel: "medium",
      missingFields: ["amount"]
    }),
    "missing_required_transfer_details"
  );
  assert.equal(
    resolveResponseSituation({
      intent: "transfer_eligibility",
      riskLevel: "high",
      toolSucceeded: false,
      failureReason: "INSUFFICIENT_BALANCE"
    }),
    "insufficient_funds"
  );
  assert.equal(
    resolveResponseSituation({
      intent: "unsafe_request",
      riskLevel: "blocked",
      toolSucceeded: false
    }),
    "security_sensitive"
  );
});

test("style context exposes only active situation phrases and blocks high-risk personality", () => {
  const oshri = assistantPersonalities.oshri;
  const balanceStyle = buildResponseStyleContext(
    oshri,
    "balance_inquiry_success",
    "low"
  );
  assert.equal(balanceStyle.maxPersonalityPhrases, 1);
  assert.ok(balanceStyle.allowedPhrases.includes("בדקתי לך"));
  assert.ok(!balanceStyle.allowedPhrases.includes("הכסף כבר בדרך"));

  const insufficientStyle = buildResponseStyleContext(
    oshri,
    "insufficient_funds",
    "high"
  );
  assert.equal(insufficientStyle.maxPersonalityPhrases, 0);
  assert.deepEqual(insufficientStyle.allowedPhrases, []);
  assert.ok(insufficientStyle.forbiddenPhrases.includes("הכסף כבר בדרך"));
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
  assert.equal(successPhrase.valid, false);
  assert.ok(successPhrase.disallowedPhrases.includes("הכסף כבר בדרך"));

  const overBudget = lintPersonalityUsage(
    "בדקתי לך. החשבון מוסר שהיתרה מוצגת בכרטיס.",
    style,
    knownPhrases
  );
  assert.equal(overBudget.valid, false);
  assert.equal(overBudget.tooManyPersonalityPhrases, true);

  const valid = lintPersonalityUsage(
    "בדקתי לך. היתרה מוצגת בכרטיס.",
    style,
    knownPhrases
  );
  assert.equal(valid.valid, true);
});
