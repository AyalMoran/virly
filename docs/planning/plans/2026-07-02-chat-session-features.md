# Chat Session Features (New Chat / Resend / Edit-and-Resend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Todoist task:** `6h2W38WrRpHRhvWc` - "add chat features" (description: "new chat / edit and resend / resend message").

**Goal:** Add three chat UX affordances to the AI assistant widget: a "new chat" button that starts a fresh conversation, a "resend" action on any past user message, and an "edit and resend" action that loads a past message into the composer for editing.

**Architecture:** All three features are client-only; the server already supports them.
The widget (`client/src/components/ui/floating-chat-widget-shadcnui.tsx`) keeps `conversationId` in state and omits it from the first request, and the server mints a fresh thread when it is absent (`conversationId ?? randomUUID()` in `server/src/routes/ai.routes.ts`), so "new chat" is just clearing widget state.
Resend re-invokes the existing `sendChatMessage(text)` path; the v2 graph's `messages` channel is append-only, and confirmation supersession (`supersededConfirmationId` handling already in `appendAssistantResponse`) covers re-asking while a transfer confirmation is pending.
Message actions are a new hook-free `ChatMessageActions` component so the repo's static-markup test harness can cover them; the hook-driven wiring is covered by typecheck + Storybook + manual verification, matching repo precedent.

**Tech Stack:** React 18 + TypeScript, lucide-react icons, existing shadcn `Button`, client Jest (native ESM, `renderToStaticMarkup`, no jsdom), Storybook.

## Global Constraints

- Client tests: co-located `__tests__/` folders, Jest globals, `renderToStaticMarkup`, no jsdom, no hooks exercised at runtime.
- The old conversation is intentionally NOT deleted on "new chat": server threads persist under their `conversationId` with a 30-day TTL (`AiConversation` model), and no delete endpoint exists; starting a new thread is the supported reset.
- Money movement safety is untouched: none of these actions confirm or deny transfers; they only send user text through the existing HITL pipeline (ADR 0006).
- Buttons must be keyboard-accessible with `aria-label`s; disable them while `isSending` is true.
- Never use emojis.

## Approach & rationale

Server-side facts this design rests on (verified 2026-07-02):

1. `POST /api/ai/chat` accepts an optional `conversationId`; when absent the route mints one (`ai.routes.ts`, `chatSchema` + `conversationId ?? randomUUID()`), so a fresh chat needs no new endpoint.
2. The widget's message list is RAM-only (`chatMessages` state); there is no history-fetch endpoint, so clearing local state fully resets the visible conversation.
3. Sending a new message while a confirmation card is pending is already handled: the response's `supersededConfirmationId` marks the old card superseded in `appendAssistantResponse`.

Design choices:

- **Edit-and-resend loads the text into the composer** rather than editing in place.
  In-place editing would imply rewriting history, which the append-only LangGraph `messages` channel cannot do; composer-loading is honest about the semantics (the edit becomes a new turn) and is a one-liner UX.
- **Resend sends the same text as a new turn** for the same reason.
- **No confirm dialog on "new chat"**: the old thread remains on the server for 30 days, so nothing is destroyed; a mis-click costs one click to keep chatting (the widget state is the only loss). Revisit if users complain.

## File Structure

| File | Responsibility |
|---|---|
| `client/src/components/assistant/ChatMessageActions.tsx` (create) | Hook-free resend/edit action row for user messages. |
| `client/src/components/assistant/__tests__/chatMessageActions.test.tsx` (create) | Unit tests for the action row. |
| `client/src/components/assistant/__stories__/ChatMessageActions.stories.tsx` (create) | Story for the action row states. |
| `client/src/components/ui/floating-chat-widget-shadcnui.tsx` (modify) | `startNewChat` handler + header button; render `ChatMessageActions` under user bubbles with resend/edit handlers. |

---

## Task 1: `ChatMessageActions` hook-free component (TDD)

**Files:**
- Create: `client/src/components/assistant/ChatMessageActions.tsx`
- Test: `client/src/components/assistant/__tests__/chatMessageActions.test.tsx`

**Interfaces:**
- Consumes: `lucide-react` (`RotateCcw`, `Pencil`).
- Produces: `function ChatMessageActions(props: { disabled: boolean; onResend: () => void; onEdit: () => void }): JSX.Element`.

- [ ] **Step 1: Write the failing test**

```tsx
// client/src/components/assistant/__tests__/chatMessageActions.test.tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatMessageActions } from "../ChatMessageActions";

test("renders resend and edit buttons with accessible labels", () => {
  const html = renderToStaticMarkup(
    <ChatMessageActions disabled={false} onResend={() => {}} onEdit={() => {}} />
  );

  expect(html).toMatch(/aria-label="Resend this message"/);
  expect(html).toMatch(/aria-label="Edit and resend this message"/);
  expect(html).toMatch(/type="button"/);
  expect(html).not.toMatch(/disabled/);
});

test("disables both buttons while a send is in flight", () => {
  const html = renderToStaticMarkup(
    <ChatMessageActions disabled onResend={() => {}} onEdit={() => {}} />
  );

  const disabledCount = (html.match(/disabled/g) ?? []).length;
  expect(disabledCount).toBe(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:client -- chatMessageActions`
Expected: FAIL - module not found.

- [ ] **Step 3: Implement the component**

```tsx
// client/src/components/assistant/ChatMessageActions.tsx
import { Pencil, RotateCcw } from "lucide-react";

/**
 * Hook-free action row under a user chat bubble. The widget owns the actual
 * resend/edit behavior; this component only renders accessible controls, so it
 * stays unit-testable in the static-markup harness.
 */
export function ChatMessageActions({
  disabled,
  onResend,
  onEdit,
}: {
  disabled: boolean;
  onResend: () => void;
  onEdit: () => void;
}) {
  const buttonClass =
    "flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground " +
    "hover:bg-background/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="flex gap-1">
      <button
        type="button"
        className={buttonClass}
        aria-label="Resend this message"
        disabled={disabled}
        onClick={onResend}
      >
        <RotateCcw className="h-3 w-3" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={buttonClass}
        aria-label="Edit and resend this message"
        disabled={disabled}
        onClick={onEdit}
      >
        <Pencil className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:client -- chatMessageActions`
Expected: PASS.

- [ ] **Step 5: Add the story**

```tsx
// client/src/components/assistant/__stories__/ChatMessageActions.stories.tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChatMessageActions } from "../ChatMessageActions";

const meta = {
  title: "AI Assistant/ChatMessageActions",
  component: ChatMessageActions,
  parameters: { layout: "centered" },
  args: {
    disabled: false,
    onResend: () => {},
    onEdit: () => {},
  },
} satisfies Meta<typeof ChatMessageActions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** While a send is in flight both actions are disabled. */
export const Disabled: Story = {
  args: { disabled: true },
};
```

- [ ] **Step 6: Commit**

```bash
git add client/src/components/assistant/ChatMessageActions.tsx client/src/components/assistant/__tests__/chatMessageActions.test.tsx client/src/components/assistant/__stories__/ChatMessageActions.stories.tsx
git commit -m "feat(assistant): hook-free ChatMessageActions row"
```

---

## Task 2: Wire resend and edit-and-resend into the widget

**Files:**
- Modify: `client/src/components/ui/floating-chat-widget-shadcnui.tsx`

**Interfaces:**
- Consumes: `ChatMessageActions` (Task 1); existing widget internals `sendChatMessage(trimmedMessage: string)`, `setMessage`, `messageInputRef`, `isSending`.

- [ ] **Step 1: Import the component**

Add to the widget's imports:

```tsx
import { ChatMessageActions } from "../assistant/ChatMessageActions";
```

- [ ] **Step 2: Render the actions under each user bubble**

In the `chatMessages.map(...)` user branch (the `flex flex-row-reverse gap-3 self-end` motion div), the bubble lives inside `<div className="chat-message-column flex max-w-[85%] flex-col items-end gap-1">`.
Add the actions row as a sibling immediately AFTER the bubble `<div className="rounded-2xl rounded-tr-none bg-primary ...">...</div>`, still inside the `chat-message-column` div:

```tsx
<ChatMessageActions
  disabled={isSending}
  onResend={() => {
    void sendChatMessage(chatMessage.content);
  }}
  onEdit={() => {
    setMessage(chatMessage.content);
    messageInputRef.current?.focus();
  }}
/>
```

Notes:
- `sendChatMessage` already trims, guards `isSending`, appends the user message, and streams the reply; resend needs nothing else.
- `setMessage` triggers the existing `useEffect` that resizes the textarea (`resizeChatTextarea` on `[message]`), so the composer grows to fit the loaded text automatically.

- [ ] **Step 3: Typecheck and run the client suite**

Run: `cd client && npx tsc -b && cd .. && npm run test:client`
Expected: no type errors, all tests PASS (no existing test asserts the user-bubble markup).

- [ ] **Step 4: Commit**

```bash
git add client/src/components/ui/floating-chat-widget-shadcnui.tsx
git commit -m "feat(assistant): resend and edit-and-resend actions on user messages"
```

---

## Task 3: "New chat" button

**Files:**
- Modify: `client/src/components/ui/floating-chat-widget-shadcnui.tsx`

**Interfaces:**
- Consumes: existing widget state setters `setConversationId`, `setChatMessages`, `setMessage`, `messageInputRef`, `isSending`, `resizeChatTextarea`.

- [ ] **Step 1: Add the handler**

Add next to the widget's other handlers (e.g. after `handleSubmit`):

```tsx
function startNewChat() {
  if (isSending) {
    return;
  }
  // The old thread stays on the server under its conversationId (30-day TTL);
  // clearing conversationId makes the next send mint a fresh thread server-side.
  setConversationId(undefined);
  setChatMessages([]);
  setMessage("");
  resizeChatTextarea(messageInputRef.current);
  messageInputRef.current?.focus();
}
```

- [ ] **Step 2: Add the header button**

Add `SquarePen` to the widget's `lucide-react` import.
In the header, immediately BEFORE the existing close button (`<Button ... aria-label="Close chat">`), add:

```tsx
<Button
  variant="ghost"
  size="icon"
  className="min-h-11 min-w-11 shrink-0 rounded-full hover:bg-background/50"
  onClick={startNewChat}
  disabled={isSending || (chatMessages.length === 0 && !conversationId)}
  aria-label="Start a new chat"
>
  <SquarePen className="h-4 w-4" />
</Button>
```

The disable condition keeps the button inert when there is nothing to reset.

- [ ] **Step 3: Typecheck and run the client suite**

Run: `cd client && npx tsc -b && cd .. && npm run test:client`
Expected: no type errors, all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/ui/floating-chat-widget-shadcnui.tsx
git commit -m "feat(assistant): new-chat button resets the conversation thread"
```

---

## Task 4: End-to-end verification

**Files:** none.

- [ ] **Step 1: Manual pass over all three features**

Run `npm run dev:server` and `npm run dev:client`, log in as a seeded user (e.g. `sga@thunder.com` / `admin1234`), open the widget, then verify:

1. Send "what's my balance", then click resend on that message: a second identical user turn is sent and answered in the SAME conversation (follow-up questions still resolve context).
2. Click edit on the message: the text appears in the composer with focus; change it and send; the reply reflects the edited text.
3. Click the new-chat button: the transcript clears back to the greeting; send "what did I just ask?": the assistant should NOT know (fresh thread; new `conversationId` visible in the network tab).
4. Ask the assistant to send money so a confirmation card appears, then resend an older message: the old card flips to superseded (existing `supersededConfirmationId` handling), and no money moves without an explicit confirm.
5. While a reply is streaming, confirm all message actions and the new-chat button are disabled.

- [ ] **Step 2: Full suites**

Run: `npm test && cd client && npx tsc -b`
Expected: PASS, no type errors.

---

## Self-Review

- **Spec coverage:** "new chat" - Task 3; "resend message" - Tasks 1-2; "edit and resend" - Tasks 1-2 (composer-loading semantics documented in Approach). Each is verified E2E in Task 4.
- **Placeholder scan:** none; insertion points are anchored to exact existing JSX/handlers quoted from the widget.
- **Type consistency:** `ChatMessageActions` props (`disabled`, `onResend`, `onEdit`) match between component (Task 1), story (Task 1), and widget usage (Task 2); `startNewChat` touches only state that exists in the widget today (`conversationId`, `chatMessages`, `message`).

## Open questions (answer later)

1. Should new-chat ask for confirmation when a transfer confirmation card is pending un-actioned? Today the pending transfer simply expires server-side (TTL) or stays actionable in the old thread; nothing unsafe happens either way.
2. A conversation list / history picker (reopening old `conversationId`s) is a natural follow-up but needs a new list endpoint; out of scope here.
3. Should resend be hidden (rather than disabled) on clarification-option turns, where re-sending the same text may re-trigger the same clarification? Watch usage first.
