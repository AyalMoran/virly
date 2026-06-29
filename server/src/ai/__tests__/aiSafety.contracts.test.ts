import { assistantIds } from "../assistants.js";
import {
  assistantIntentValues,
  assistantToolNames,
  aiStreamErrorEventTypeValues,
  aiStreamPhases,
  aiStreamResultEventTypeValues,
  aiStreamStatusEventTypeValues,
  clarificationReasonValues,
  clarificationReplyTypeValues,
  confirmationActionMethodValues,
  confirmationActionValues,
  confirmationResponseStatusValues,
  confirmationSupersededErrorValues,
  transferConfirmationCurrencyValues,
  transferConfirmationStatusValues,
  transferConfirmationTypeValues,
  transferWarningCodeValues
} from "../state.js";
import {
  extractOpenApiEnumValues,
  extractOpenApiPropertyEnumValues,
  extractOpenApiNestedEnumValues,
  extractOpenApiOneOfPropertyEnumValues,
  extractClientTypeUnionValues
} from "./_aiSafetyKit1.js";

test("openapi assistant intent enum stays in sync with state contracts", () => {
  expect(extractOpenApiEnumValues("AssistantIntent")).toStrictEqual([...assistantIntentValues]);
});

test("openapi ai tool enum stays in sync with state contracts", () => {
  expect(extractOpenApiEnumValues("AiToolName")).toStrictEqual([...assistantToolNames]);
});

test("openapi clarification reason enum stays in sync with state contracts", () => {
  expect(extractOpenApiPropertyEnumValues("AiClarificationRequest", "reason")).toStrictEqual([...clarificationReasonValues]);
});

test("openapi clarification expectedReplyType enum stays in sync with state contracts", () => {
  expect(extractOpenApiPropertyEnumValues("AiClarificationRequest", "expectedReplyType")).toStrictEqual([...clarificationReplyTypeValues]);
});

test("openapi ai chat request assistantId enum stays in sync with assistant ids", () => {
  expect(extractOpenApiPropertyEnumValues("AiChatRequest", "assistantId")).toStrictEqual([...assistantIds]);
});

test("openapi ai chat response assistantId enum stays in sync with assistant ids", () => {
  expect(extractOpenApiPropertyEnumValues("AiChatResponse", "assistantId")).toStrictEqual([...assistantIds]);
});

test("openapi stream status event type stays in sync with state contracts", () => {
  expect(extractOpenApiPropertyEnumValues("AiChatStreamStatusEvent", "type")).toStrictEqual([...aiStreamStatusEventTypeValues]);
});

test("openapi stream status phase stays in sync with state contracts", () => {
  expect(extractOpenApiPropertyEnumValues("AiChatStreamStatusEvent", "phase")).toStrictEqual([...aiStreamPhases]);
});

test("openapi stream result event type stays in sync with state contracts", () => {
  expect(extractOpenApiPropertyEnumValues("AiChatStreamResultEvent", "type")).toStrictEqual([...aiStreamResultEventTypeValues]);
});

test("openapi stream error event type stays in sync with state contracts", () => {
  expect(extractOpenApiPropertyEnumValues("AiChatStreamErrorEvent", "type")).toStrictEqual([...aiStreamErrorEventTypeValues]);
});

test("openapi ai tool status enum stays in sync with client contract", () => {
  expect(extractOpenApiEnumValues("AiToolStatus")).toStrictEqual(extractClientTypeUnionValues("AiToolStatus"));
});

test("openapi transfer confirmation type enum stays in sync with state contracts", () => {
  expect(extractOpenApiPropertyEnumValues("AiTransferConfirmation", "type")).toStrictEqual([...transferConfirmationTypeValues]);
});

test("openapi transfer confirmation status enum stays in sync with state contracts", () => {
  expect(extractOpenApiPropertyEnumValues("AiTransferConfirmation", "status")).toStrictEqual([...transferConfirmationStatusValues]);
});

test("openapi transfer confirmation currency enum stays in sync with state contracts", () => {
  expect(extractOpenApiPropertyEnumValues("AiTransferConfirmation", "currency")).toStrictEqual([...transferConfirmationCurrencyValues]);
});

test("openapi transfer confirmation warning code enum stays in sync with state contracts", () => {
  expect(extractOpenApiNestedEnumValues("AiTransferConfirmation", ["warnings", "items", "properties", "code"])).toStrictEqual([...transferWarningCodeValues]);
});

test("openapi confirmation action method enum stays in sync with state contracts", () => {
  expect(extractOpenApiPropertyEnumValues("AiConfirmationActionDescriptor", "method")).toStrictEqual([...confirmationActionMethodValues]);
});

test("openapi confirmation action enum stays in sync with state contracts", () => {
  expect(extractOpenApiPropertyEnumValues("AiConfirmationRequest", "action")).toStrictEqual([...confirmationActionValues]);
});

test("openapi confirmation response status values stay in sync with state contracts", () => {
  expect(extractOpenApiOneOfPropertyEnumValues("AiConfirmationResponse", "status")).toStrictEqual([...confirmationResponseStatusValues]);
});

test("openapi superseded confirmation error enum stays in sync with state contracts", () => {
  expect(extractOpenApiPropertyEnumValues("AiSupersededConfirmationError", "error")).toStrictEqual([...confirmationSupersededErrorValues]);
});

test("client assistant intent union stays in sync with state contracts", () => {
  expect(extractClientTypeUnionValues("AssistantIntent")).toStrictEqual([...assistantIntentValues]);
});

test("client assistant id union stays in sync with assistant ids", () => {
  expect(extractClientTypeUnionValues("AssistantId")).toStrictEqual([...assistantIds]);
});

test("client ai tool union stays in sync with state contracts", () => {
  expect(extractClientTypeUnionValues("AiToolName")).toStrictEqual([...assistantToolNames]);
});

test("client clarification reason union stays in sync with state contracts", () => {
  expect(extractClientTypeUnionValues("AiClarificationReason")).toStrictEqual([...clarificationReasonValues]);
});

test("client clarification expectedReplyType union stays in sync with state contracts", () => {
  expect(extractClientTypeUnionValues("AiClarificationExpectedReplyType")).toStrictEqual([...clarificationReplyTypeValues]);
});

test("client ai stream phase union stays in sync with backend stream phases", () => {
  expect(extractClientTypeUnionValues("AiChatStreamPhase")).toStrictEqual([...aiStreamPhases]);
});

test("client stream status event type stays in sync with state contracts", () => {
  expect(extractClientTypeUnionValues("AiChatStreamStatusEventType")).toStrictEqual([...aiStreamStatusEventTypeValues]);
});

test("client stream result event type stays in sync with state contracts", () => {
  expect(extractClientTypeUnionValues("AiChatStreamResultEventType")).toStrictEqual([...aiStreamResultEventTypeValues]);
});

test("client stream error event type stays in sync with state contracts", () => {
  expect(extractClientTypeUnionValues("AiChatStreamErrorEventType")).toStrictEqual([...aiStreamErrorEventTypeValues]);
});

test("client transfer confirmation type union stays in sync with state contracts", () => {
  expect(extractClientTypeUnionValues("AiTransferConfirmationType")).toStrictEqual([...transferConfirmationTypeValues]);
});

test("client transfer confirmation status union stays in sync with state contracts", () => {
  expect(extractClientTypeUnionValues("AiTransferConfirmationStatus")).toStrictEqual([...transferConfirmationStatusValues]);
});

test("client transfer confirmation currency union stays in sync with state contracts", () => {
  expect(extractClientTypeUnionValues("AiTransferConfirmationCurrency")).toStrictEqual([...transferConfirmationCurrencyValues]);
});

test("client transfer warning code union stays in sync with state contracts", () => {
  expect(extractClientTypeUnionValues("AiTransferWarningCode")).toStrictEqual([...transferWarningCodeValues]);
});

test("client confirmation method union stays in sync with state contracts", () => {
  expect(extractClientTypeUnionValues("AiConfirmationMethod")).toStrictEqual([...confirmationActionMethodValues]);
});

test("client confirmation action union stays in sync with state contracts", () => {
  expect(extractClientTypeUnionValues("AiConfirmationAction")).toStrictEqual([...confirmationActionValues]);
});

test("client confirmation response status union stays in sync with state contracts", () => {
  expect(extractClientTypeUnionValues("AiConfirmationResponseStatus")).toStrictEqual([...confirmationResponseStatusValues]);
});

test("client superseded confirmation error union stays in sync with state contracts", () => {
  expect(extractClientTypeUnionValues("AiSupersededConfirmationErrorCode")).toStrictEqual([...confirmationSupersededErrorValues]);
});
