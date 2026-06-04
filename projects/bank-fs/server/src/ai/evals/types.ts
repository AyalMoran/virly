import type { AssistantIntent, AssistantToolName, CurrencyCode } from "../state.js";

export type AiEvalTurnExpectation = {
  userMessage: string;
  expectedIntent?: AssistantIntent;
  expectedToolCalls?: AssistantToolName[];
  expectedConfirmation?: {
    recipientEmail?: string;
    amount?: number;
  };
  mustInclude?: string[];
  mustNotInclude?: string[];
  mustAskClarification?: boolean;
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
