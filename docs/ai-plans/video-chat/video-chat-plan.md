Below is a practical plan for adding **video chat with support or salesperson** to Virly using **Jitsi**.

## 1. Product goal

Add a “Talk to support” / “Talk to sales” feature where a logged-in Virly user can start or request a secure video call with an authorized Virly representative.

The feature should support two flows:

### Flow A: Immediate support call

User clicks:

> Help → Video Support

Virly creates a support session, generates a Jitsi room, and shows the embedded video call inside the app.

### Flow B: Sales consultation

User clicks:

> Talk to Sales / Upgrade Account / Business Account Inquiry

Virly creates a sales session, optionally asks for topic/context, and connects the user to a salesperson or schedules a future call.

For the first version, I would implement **instant room creation + agent joins manually from an internal dashboard**. Queue routing can come later.

---

## 2. Recommended Jitsi integration choice

Jitsi gives a few integration options. For Virly, I would use the **Jitsi IFrame API** first because it is the fastest and cleanest way to embed meetings inside a React app. Jitsi’s official docs describe the IFrame API as the way to embed Jitsi Meet into a site or app, with support for meeting events and commands. ([jitsi.github.io][1])

Use this path:

```txt
React frontend
  ↓
Virly backend creates video session
  ↓
Backend returns room name + signed JWT/config
  ↓
Frontend embeds Jitsi via external_api.js
  ↓
Support/sales agent joins through internal dashboard
```

### Do not use public `meet.jit.si` for production banking support

For demos, public `meet.jit.si` is fine. Jitsi’s API page shows basic embedding with `https://meet.jit.si/external_api.js`. ([Jitsi][2])

For Virly production, use one of these:

| Option                        | Use case               | Pros                                       | Cons                                           |
| ----------------------------- | ---------------------- | ------------------------------------------ | ---------------------------------------------- |
| JaaS / 8x8 Jitsi as a Service | Fast production launch | Hosted, scalable, JWT support, less DevOps | Paid, external dependency                      |
| Self-hosted Jitsi             | Maximum control        | Full domain/data/control, customizable     | More DevOps, scaling, monitoring               |
| Public meet.jit.si            | Demo only              | Very fast MVP                              | Not appropriate for controlled banking support |

For a banking-style app, I would start with **JaaS** unless you specifically want to manage video infrastructure yourself. 8x8’s JaaS docs say each meeting endpoint should receive a signed JWT, and that token is passed into the IFrame or mobile SDK. ([developer.8x8.com][3])

---

## 3. Core security rule

The video call must not become an authorization channel for financial actions.

Meaning:

```txt
User saying something on video ≠ valid transfer confirmation.
Support agent saying something on video ≠ backend authorization.
Salesperson cannot see private banking data unless explicitly permitted by backend role policy.
```

All sensitive data still comes from the backend through normal authenticated APIs.

Support can:

```txt
Explain UI
Guide user
Help debug account access
Explain transfer limits
Explain transaction status if authorized
Escalate issues
```

Support must not:

```txt
Manually move money
Bypass confirmation
Read another user’s private data
Treat video conversation as transfer approval
Override backend transfer validation
```

This keeps the feature consistent with Virly’s existing AI assistant rule: conversational interfaces can guide, but backend authorization/business logic remains the source of truth.

---

## 4. Main entities

Add a `video_sessions` collection/table.

```ts
type VideoSessionType = "support" | "sales";
type VideoSessionStatus =
  | "requested"
  | "waiting_for_agent"
  | "active"
  | "ended"
  | "missed"
  | "cancelled"
  | "failed";

type VideoSession = {
  id: string;
  userId: string;
  assignedAgentId?: string | null;

  type: VideoSessionType;
  status: VideoSessionStatus;

  roomName: string;
  provider: "jitsi-jaas" | "jitsi-self-hosted" | "jitsi-public-demo";

  topic?: string;
  userProblemSummary?: string;

  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;

  userJoinedAt?: Date;
  agentJoinedAt?: Date;

  metadata: {
    userAgent?: string;
    locale?: string;
    source?: "dashboard" | "ai_assistant" | "transfer_flow" | "account_page";
  };
};
```

For sales, you may also add:

```ts
type SalesLead = {
  id: string;
  userId: string;
  videoSessionId?: string;
  topic: "business_account" | "premium_account" | "loan" | "general";
  status: "new" | "contacted" | "qualified" | "closed" | "lost";
  notes?: string;
  createdAt: Date;
};
```

---

## 5. Backend API design

Suggested routes:

```txt
POST   /api/video-sessions
GET    /api/video-sessions/:id
POST   /api/video-sessions/:id/join-token
POST   /api/video-sessions/:id/end
GET    /api/admin/video-sessions
POST   /api/admin/video-sessions/:id/assign
POST   /api/admin/video-sessions/:id/join-token
```

### Create session

```http
POST /api/video-sessions
```

Body:

```json
{
  "type": "support",
  "topic": "transfer_status",
  "source": "ai_assistant"
}
```

Backend responsibilities:

```txt
1. Verify user JWT cookie.
2. Create unique room name.
3. Create video session record.
4. Return session ID and frontend-safe Jitsi config.
5. Do not expose provider secrets.
```

Example response:

```json
{
  "sessionId": "vs_123",
  "status": "waiting_for_agent",
  "roomName": "virly-support-vs_123",
  "jitsi": {
    "domain": "8x8.vc",
    "appId": "your-jaas-app-id",
    "roomName": "your-jaas-app-id/virly-support-vs_123"
  }
}
```

### Generate join token

```http
POST /api/video-sessions/:id/join-token
```

Backend returns a short-lived signed JWT for Jitsi.

Token claims should include:

```txt
room
user identity
display name
role / moderator flag
expiration time
session ID
```

Jitsi’s official token authentication docs describe JWT/token-based room creation control, and the older secure-domain setup is marked as deprecated in favor of JWT authentication. ([jitsi.github.io][4])

---

## 6. Role model

Add internal roles:

```ts
type VirlyRole =
  | "user"
  | "support_agent"
  | "sales_agent"
  | "support_manager"
  | "admin";
```

Permissions:

| Role            | Can create user call | Can join support call |  Can join sales call |                Can view financial data |
| --------------- | -------------------: | --------------------: | -------------------: | -------------------------------------: |
| user            |                  Yes |      Own session only |     Own session only |                          Own data only |
| support_agent   |                   No |     Assigned sessions |        No or limited |      Only through allowed support APIs |
| sales_agent     |                   No |                    No |    Assigned sessions | No sensitive financial data by default |
| support_manager |                   No |   Any support session |             Optional |             Limited audit/admin access |
| admin           |                   No |  Emergency/admin only | Emergency/admin only |             Controlled by admin policy |

Important: the Jitsi moderator role is not the same as Virly authorization. Moderator means meeting-level control. Virly authorization still lives in your backend.

---

## 7. Room naming strategy

Never use predictable public room names like:

```txt
ayal-support
virly-help
transfer-problem
```

Use opaque names:

```ts
const roomName = `virly-${type}-${sessionId}-${randomSuffix}`;
```

Example:

```txt
virly-support-vs_8f42c9f1-k7m2xq
```

Do not put the user’s name, email, account ID, transaction ID, or transfer amount in the Jitsi room name.

---

## 8. Frontend UX

### User side

Add a `VideoSupportButton`:

```txt
Need help?
[Start video support]
```

When clicked:

```txt
1. Create video session.
2. Show waiting screen.
3. Load Jitsi iframe.
4. Show basic safety notice:
   "Support can guide you, but transfers still require confirmation in the app."
5. Let user end call.
```

### Agent side

Add internal dashboard page:

```txt
/admin/support/video-sessions
```

Agent sees:

```txt
Waiting sessions
Active sessions
Missed sessions
User display name
Topic
Created time
Source
Join button
```

For sales:

```txt
/admin/sales/video-sessions
```

Salesperson sees:

```txt
Lead topic
User name
Requested product
Join button
Notes
Follow-up status
```

---

## 9. React Jitsi embed shape

The browser loads Jitsi’s external API and creates the meeting iframe. Jitsi’s docs show the core pattern: load `external_api.js`, set `domain`, `roomName`, dimensions, and `parentNode`, then instantiate `JitsiMeetExternalAPI`. ([Jitsi][2])

Example structure:

```tsx
import { useEffect, useRef } from "react";

type JitsiMeetingProps = {
  domain: string;
  roomName: string;
  jwt: string;
  displayName: string;
  email?: string;
  onEnded?: () => void;
};

declare global {
  interface Window {
    JitsiMeetExternalAPI?: any;
  }
}

export function JitsiMeeting({
  domain,
  roomName,
  jwt,
  displayName,
  email,
  onEnded,
}: JitsiMeetingProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<any>(null);

  useEffect(() => {
    let disposed = false;

    async function loadScript() {
      if (window.JitsiMeetExternalAPI) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = `https://${domain}/external_api.js`;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Jitsi API"));
        document.body.appendChild(script);
      });
    }

    async function startMeeting() {
      await loadScript();

      if (disposed || !containerRef.current || !window.JitsiMeetExternalAPI) {
        return;
      }

      const api = new window.JitsiMeetExternalAPI(domain, {
        roomName,
        parentNode: containerRef.current,
        jwt,
        width: "100%",
        height: "100%",
        userInfo: {
          displayName,
          email,
        },
        configOverwrite: {
          prejoinPageEnabled: false,
          disableDeepLinking: true,
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
        },
      });

      api.addListener("videoConferenceJoined", () => {
        console.log("Joined Jitsi meeting");
      });

      api.addListener("videoConferenceLeft", () => {
        onEnded?.();
      });

      apiRef.current = api;
    }

    startMeeting();

    return () => {
      disposed = true;

      if (apiRef.current) {
        apiRef.current.dispose();
        apiRef.current = null;
      }
    };
  }, [domain, roomName, jwt, displayName, email, onEnded]);

  return <div ref={containerRef} style={{ width: "100%", height: "700px" }} />;
}
```

In production, remove sensitive `console.log`s and wrap loading errors with user-friendly UI.

---

## 10. Backend JWT generation

For JaaS, you generate Jitsi JWTs server-side. Do not generate them in the frontend. 8x8’s JaaS documentation says the JWT is signed with a private key and passed into the IFrame or mobile SDK. ([developer.8x8.com][3])

Backend pseudo-structure:

```ts
type CreateJitsiTokenInput = {
  sessionId: string;
  roomName: string;
  userId: string;
  displayName: string;
  email?: string;
  role: "user" | "agent";
  isModerator: boolean;
};

function createJitsiToken(input: CreateJitsiTokenInput): string {
  /*
    Sign with server-side private key.

    Include:
    - aud
    - iss
    - sub
    - room
    - exp
    - nbf
    - context.user.name
    - context.user.email
    - context.user.moderator
    - context.features if supported by provider
  */

  throw new Error("Implement with selected Jitsi/JaaS JWT library");
}
```

Token rules:

```txt
Short expiration, for example 5 to 15 minutes.
Room-specific token.
User-specific token.
No account balances in token.
No transaction details in token.
No provider private key in frontend.
```

---

## 11. Jitsi events to store

Use Jitsi IFrame events for lifecycle tracking. The Jitsi docs state that `JitsiMeetExternalAPI` exposes an EventEmitter-style API for listening to events. ([jitsi.github.io][5])

Track:

```txt
videoConferenceJoined
videoConferenceLeft
participantJoined
participantLeft
readyToClose
```

Store:

```txt
userJoinedAt
agentJoinedAt
startedAt
endedAt
duration
missed status
```

Do not store video/audio unless you explicitly build a recording feature, which I would not include in v1.

---

## 12. AI assistant integration

The Virly AI assistant can offer video support but should not directly expose a Jitsi room without going through backend session creation.

Example assistant behavior:

User:

```txt
I need help with a transfer.
```

Assistant:

```txt
I can show the transfer status here, or connect you to video support.
```

If user chooses video support:

```txt
AI calls backend tool:
createSupportVideoSession({ source: "ai_assistant", topic: "transfer_status" })
```

Then the app renders a CTA:

```txt
[Join video support]
```

The assistant should not say:

```txt
Join this room: virly-support-...
```

Better:

```txt
A support video session is ready. Use the secure button in the app to join.
```

---

## 13. Support data visibility

When support joins a call, do not automatically show all user banking data.

Use a “support context panel” with controlled fields:

```txt
User name
Session topic
User-reported issue
Basic account status: active / locked / pending verification
Recent failed action type, if relevant
Support-safe transaction reference, if user asked about a transaction
```

Avoid by default:

```txt
Full balance
Full transaction history
Recipient list
Account IDs
Sensitive auth details
Personal documents
```

If support needs more data, they must use authorized backend support APIs with audit logging.

---

## 14. Audit logging

Every sensitive step should create an audit event:

```ts
type AuditEvent =
  | "video_session_created"
  | "video_session_join_token_issued"
  | "video_session_user_joined"
  | "video_session_agent_joined"
  | "video_session_ended"
  | "support_context_viewed"
  | "support_note_added";
```

Include:

```txt
actorId
actorRole
targetUserId
videoSessionId
timestamp
IP/device metadata if available
action result
```

Do not include:

```txt
raw video content
audio transcript
private Jitsi JWT
provider private key
```

---

## 15. MVP scope

Build v1 with:

```txt
User can start support video session.
User can start sales video session.
Backend creates session records.
Backend generates Jitsi JWT.
Frontend embeds Jitsi.
Internal support dashboard lists waiting sessions.
Agent can join assigned session.
Session lifecycle is tracked.
Audit events are written.
AI assistant can offer video support CTA.
```

Skip v1:

```txt
Recording
Transcription
Screen control
Automatic call routing
Queue priority
Call scheduling
CRM integration
Post-call analytics
```

---

## 16. Suggested implementation phases

### Phase 1: Provider decision

Pick one:

```txt
JaaS for production-fast path
Self-hosted Jitsi for infrastructure-control path
Public meet.jit.si only for local demo
```

My recommendation: **JaaS for v1**, self-host later only if you need control or cost optimization.

### Phase 2: Data model

Add:

```txt
VideoSession model
SalesLead model, optional
Audit event types
Agent role model
```

### Phase 3: Backend routes

Implement:

```txt
POST /api/video-sessions
GET /api/video-sessions/:id
POST /api/video-sessions/:id/join-token
POST /api/video-sessions/:id/end
GET /api/admin/video-sessions
POST /api/admin/video-sessions/:id/assign
POST /api/admin/video-sessions/:id/join-token
```

### Phase 4: Frontend user UI

Implement:

```txt
VideoSupportButton
VideoSalesButton
VideoSessionPage
JitsiMeeting component
Waiting-for-agent state
Call-ended state
```

### Phase 5: Agent dashboard

Implement:

```txt
Waiting sessions table
Join session button
Assign to me
End session
Add notes
View safe support context
```

### Phase 6: AI assistant integration

Add a safe tool/action:

```ts
createVideoSupportSession({
  type: "support" | "sales",
  topic: string,
  source: "ai_assistant"
});
```

Assistant returns a UI action, not a raw room link.

### Phase 7: Hardening

Add:

```txt
Short-lived Jitsi tokens
Room-specific tokens
Agent role checks
Rate limiting
Session expiration
Audit logging
No sensitive data in room names
No private data in frontend config
```

### Phase 8: Testing

Test:

```txt
Unauthenticated user cannot create session.
User cannot join another user’s session.
Sales agent cannot join support session unless allowed.
Support agent cannot join unassigned session if policy forbids it.
Expired Jitsi token fails.
Room name does not leak user info.
Session ending updates DB.
AI assistant does not expose raw room link.
Video support does not bypass transfer confirmation.
```

---

## 17. Best architecture summary

```txt
Virly frontend:
  React video support UI
  Jitsi iframe embed

Virly backend:
  Owns authorization
  Owns video session records
  Owns Jitsi JWT signing
  Owns audit logs

Jitsi:
  Handles real-time video/audio
  Does not decide Virly permissions
  Does not store Virly financial state

AI assistant:
  Can suggest or initiate a video support session
  Cannot authorize financial actions
  Cannot expose raw sensitive room details
```

The clean design principle is:

```txt
Jitsi is the media layer.
Virly is the trust, identity, authorization, audit, and business-logic layer.
```