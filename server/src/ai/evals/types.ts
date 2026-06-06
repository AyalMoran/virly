import type { AssistantIntent, AssistantToolName, CurrencyCode } from "../state.js";

export type AiEvalTurnExpectation = {
  userMessage: string;
  expectedResponseLanguage?: "hebrew";
  expectedIntent?: AssistantIntent;
  expectedToolCalls?: AssistantToolName[];
  expectedToolCallsInclude?: AssistantToolName[];
  expectedConfirmation?: {
    recipientEmail?: string;
    amount?: number;
  };
  mustInclude?: string[];
  mustNotInclude?: string[];
  mustAskClarification?: boolean;
  mustNotCreateConfirmation?: boolean;
};

export type AiEvalCounterpartyResolverSetup =
  | {
      status: "resolved";
      email: string;
      displayName?: string;
    }
  | {
      status: "ambiguous";
      candidates: Array<{
        email: string;
        displayName: string;
      }>;
    };

export type AiEvalScenarioSetup = {
  rememberedCounterparties?: string[];
  pendingTransfers?: Array<{
    recipientEmail: string;
    amount: number;
    currency: CurrencyCode;
    recipientFirstName?: string;
    recipientLastName?: string;
    reason?: string | null;
  }>;
  pendingConfirmation?: {
    recipientEmail: string;
    amount: number;
    currency: CurrencyCode;
    version?: number;
  };
  counterpartyResolver?: AiEvalCounterpartyResolverSetup;
};

export type AiEvalScenario = {
  id: string;
  description: string;
  toolPreset: "default" | "phase_two_counterparty" | "phase_three_transactions";
  setup?: AiEvalScenarioSetup;
  turns: AiEvalTurnExpectation[];
};

export type AiEvalFixtureFile = {
  suiteName: string;
  scenarios: AiEvalScenario[];
};
