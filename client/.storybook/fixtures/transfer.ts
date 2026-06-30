/**
 * Transfer fixtures: a server quote and a prepared (pending) confirmation that
 * sits at the confirmation gate. Far-future expiry keeps it "pending" rather
 * than "Expired" (isConfirmationExpired compares against Date.now()).
 */
import type { AiTransferConfirmation, TransferQuote } from "@/lib/types";

export const transferQuoteFixture: TransferQuote = {
  enteredAmount: 100,
  enteredCurrency: "USD",
  amountIls: 370.37,
  rate: 0.27,
  rateFetchedAt: "2026-06-26T08:00:00.000Z",
  rateValidForDate: "2026-06-26",
  baseCurrency: "ILS",
  provider: "storybook-fixture",
};

export const transferConfirmationFixture: AiTransferConfirmation = {
  id: "conf_test_0001",
  version: 1,
  type: "transfer",
  status: "pending",
  recipientEmail: "maya.cohen@virly.test",
  recipientFirstName: "Maya",
  recipientLastName: "Cohen",
  amount: 250,
  currency: "ILS",
  recipient: {
    email: "maya.cohen@virly.test",
    firstName: "Maya",
    lastName: "Cohen",
    displayName: "Maya Cohen",
    verified: true,
  },
  amountDetails: { value: 250, currency: "ILS", formatted: "₪250.00" },
  reason: "Dinner split",
  warnings: [
    {
      code: "NEW_RECIPIENT",
      message: "This is the first time you send money to Maya.",
    },
  ],
  expiresAt: "2099-12-31T23:59:59.000Z",
  confirmAction: {
    method: "POST",
    path: "/api/ai/confirmations/conf_test_0001",
    body: { action: "confirm", version: 1 },
  },
  denyAction: {
    method: "POST",
    path: "/api/ai/confirmations/conf_test_0001",
    body: { action: "deny", version: 1 },
  },
  supersedesId: null,
};

/** Same prepared transfer, already lapsed — drives the "Expired" gate state. */
export const expiredTransferConfirmationFixture: AiTransferConfirmation = {
  ...transferConfirmationFixture,
  id: "conf_test_0002",
  expiresAt: "2020-01-01T00:00:00.000Z",
};
