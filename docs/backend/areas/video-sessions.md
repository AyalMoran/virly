# Backend area: Video sessions

> Human-agent (Jitsi) video calls — distinct from the AI assistant. A user
> lifecycle under `/api/video-sessions` and a role-gated agent lifecycle under
> `/api/admin/video-sessions`. Both routers live in **one** file. See
> [`../index.md`](../index.md) for layering.

**Router:** `server/src/routes/videoSession.routes.ts` — exports `default`
(user router, mounted at `/api/video-sessions`) and `adminVideoSessionRoutes`
(agent router, mounted at `/api/admin/video-sessions`).
**Services:** `server/src/services/videoSession.service.ts`,
`server/src/services/jitsiProvider.service.ts`,
`server/src/services/videoAuditLog.service.ts`
**Middleware:** `server/src/middleware/roles.ts`
(`requireAnyVideoAgentRole`)
**Types:** `server/src/repositories/types.ts`
(`videoSessionTypeValues`, `videoSessionStatusValues`, `videoSessionSourceValues`)

## Endpoints — user (`/api/video-sessions`, all require auth)

| Method | Path | Auth | Handler calls | Notes |
|--------|------|------|---------------|-------|
| POST | `/api/video-sessions` | Yes (+ CSRF) | `createVideoSession` | Creates a session (`type`, optional topic/summary/source/locale). |
| GET | `/api/video-sessions/:id` | Yes | `getOwnVideoSession` | Owner-scoped fetch. |
| POST | `/api/video-sessions/:id/join-token` | Yes (+ CSRF) | `issueVideoJoinConfig` (`actorKind: "user"`) | Returns the Jitsi join config. |
| POST | `/api/video-sessions/:id/end` | Yes (+ CSRF) | `endVideoSession` (`actorKind: "user"`) | Marks the session ended. |

## Endpoints — admin (`/api/admin/video-sessions`, require auth + video-agent role)

| Method | Path | Auth | Handler calls | Notes |
|--------|------|------|---------------|-------|
| GET | `/api/admin/video-sessions` | Yes (+ role) | `listAgentVideoSessions` | Lists sessions for the agent, filterable by `type`/`status`. |
| POST | `/api/admin/video-sessions/:id/assign` | Yes (+ CSRF + role) | `assignVideoSessionToAgent` | Claims a session for the acting agent. |
| POST | `/api/admin/video-sessions/:id/join-token` | Yes (+ CSRF + role) | `issueVideoJoinConfig` (`actorKind: "agent"`) | Agent Jitsi join config. |
| POST | `/api/admin/video-sessions/:id/end` | Yes (+ CSRF + role) | `endVideoSession` (`actorKind: "agent"`) | Agent ends the session. |

Request/response bodies: [API reference §1 (Video Sessions / Admin)](../../api/README.md#1-endpoint-groups).

## Layer walk

- **Route** — `router.use(requireAuth)` guards the whole user router;
  `adminRouter.use(requireAuth, requireAnyVideoAgentRole)` guards the agent
  router. Each handler validates the session id (`sessionIdSchema`) and body
  enums, gathers request metadata (ip/user-agent/locale), and delegates to the
  service; responses are mapped via `toVideoSessionDto`.
- **Service** (`videoSession.service.ts`) owns the lifecycle (create / get /
  assign / join / end), ownership + role scoping, and raises
  `VideoSessionServiceError` (an `AppError`). It calls `jitsiProvider.service.ts`
  to build the room + JWT join config and `videoAuditLog.service.ts`
  (`writeVideoAuditLog`) to record every lifecycle event.
- **Repository** access through the `videoSessions` and `videoAuditLogs` seam
  interfaces (Mongo backing `models/VideoSession.ts`, `models/VideoAuditLog.ts`).

## Cross-cutting

- The agent endpoints are the only ones in the backend gated by **role**
  (`middleware/roles.ts`), not just authentication. Allowed session types per
  role come from `getAllowedVideoSessionTypes`.
- Video sessions are referenced by the assistant only through a CTA block
  (the AI route can create a session) — see [AI](ai.md); they are not part of the
  AI graph.
