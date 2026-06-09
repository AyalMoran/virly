import { useCallback, useEffect, useMemo, useState } from "react";
import { Headphones, PhoneOff, RefreshCw, ShieldAlert, UserRound, Video } from "lucide-react";
import { Button, Card, ErrorBanner, PageHeader, Skeleton } from "../../components/Primitives";
import { api } from "../../lib/api";
import type {
  AgentVideoSession,
  JitsiJoinConfig,
  UserRole,
  VideoSessionStatus,
  VideoSessionType
} from "../../lib/types";
import { useAuth } from "../auth/AuthProvider";
import { JitsiMeeting } from "./JitsiMeeting";

const statusFilters: Array<VideoSessionStatus | "all"> = [
  "all",
  "waiting_for_agent",
  "active",
  "ended",
  "cancelled",
  "failed",
  "missed"
];

function canUseAgentVideo(role?: UserRole) {
  return (
    role === "support_agent" ||
    role === "sales_agent" ||
    role === "support_manager" ||
    role === "admin"
  );
}

function allowedType(role?: UserRole): VideoSessionType | "all" {
  if (role === "sales_agent") {
    return "sales";
  }
  if (role === "support_agent" || role === "support_manager") {
    return "support";
  }
  return "all";
}

function formatStatus(status: string) {
  return status.replace(/_/g, " ");
}

export function AgentVideoSessionsPage() {
  const auth = useAuth();
  const [sessions, setSessions] = useState<AgentVideoSession[]>([]);
  const [status, setStatus] = useState<VideoSessionStatus | "all">("waiting_for_agent");
  const [type, setType] = useState<VideoSessionType | "all">(() =>
    allowedType(auth.user?.role)
  );
  const [activeSession, setActiveSession] = useState<AgentVideoSession | null>(null);
  const [jitsi, setJitsi] = useState<JitsiJoinConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  const agentAllowed = canUseAgentVideo(auth.user?.role);
  const displayName = useMemo(
    () => auth.user?.email.split("@")[0] || "Virly agent",
    [auth.user?.email]
  );

  const loadSessions = useCallback(async () => {
    if (!agentAllowed) {
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      const response = await api.adminVideoSessions({
        ...(type !== "all" ? { type } : {}),
        ...(status !== "all" ? { status } : {})
      });
      setSessions(response.sessions);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load sessions."
      );
    } finally {
      setIsLoading(false);
    }
  }, [agentAllowed, status, type]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  async function assignSession(session: AgentVideoSession) {
    setIsBusy(true);
    setError("");
    try {
      await api.assignVideoSession(session.id);
      await loadSessions();
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "Unable to assign.");
    } finally {
      setIsBusy(false);
    }
  }

  async function joinSession(session: AgentVideoSession) {
    setIsBusy(true);
    setError("");
    try {
      const response = await api.adminVideoJoinToken(session.id);
      setActiveSession({ ...session, ...response.session });
      setJitsi(response.jitsi);
      await loadSessions();
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Unable to join.");
    } finally {
      setIsBusy(false);
    }
  }

  async function endActiveSession() {
    if (!activeSession) {
      return;
    }

    setIsBusy(true);
    setError("");
    try {
      await api.adminEndVideoSession(activeSession.id);
      setActiveSession(null);
      setJitsi(null);
      await loadSessions();
    } catch (endError) {
      setError(endError instanceof Error ? endError.message : "Unable to end session.");
    } finally {
      setIsBusy(false);
    }
  }

  if (!agentAllowed) {
    return (
      <div className="page-stack">
        <PageHeader eyebrow="Internal" title="Video queue" />
        <Card className="video-empty-stage">
          <ShieldAlert aria-hidden="true" />
          <h2>Agent access required</h2>
          <p>Your account is not authorized for the internal video queue.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-stack agent-video-page">
      <PageHeader eyebrow="Internal" title="Video queue">
        <Button type="button" variant="secondary" onClick={loadSessions} disabled={isLoading}>
          <RefreshCw size={18} />
          Refresh
        </Button>
      </PageHeader>

      {error ? <ErrorBanner message={error} /> : null}

      <Card className="agent-video-filters">
        <label>
          <span>Type</span>
          <select
            value={type}
            onChange={(event) => setType(event.target.value as VideoSessionType | "all")}
            disabled={allowedType(auth.user?.role) !== "all"}
          >
            <option value="all">All</option>
            <option value="support">Support</option>
            <option value="sales">Sales</option>
          </select>
        </label>
        <label>
          <span>Status</span>
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as VideoSessionStatus | "all")
            }
          >
            {statusFilters.map((value) => (
              <option key={value} value={value}>
                {formatStatus(value)}
              </option>
            ))}
          </select>
        </label>
      </Card>

      <div className="agent-video-layout">
        <Card className="agent-video-list">
          {isLoading ? (
            <Skeleton rows={5} />
          ) : sessions.length === 0 ? (
            <div className="video-empty-stage compact">
              <Video aria-hidden="true" />
              <h2>No sessions</h2>
              <p>No video sessions match the current filters.</p>
            </div>
          ) : (
            sessions.map((session) => {
              const Icon = session.type === "sales" ? UserRound : Headphones;
              return (
                <article key={session.id} className="agent-video-row">
                  <span className="agent-video-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <div className="agent-video-row-main">
                    <div className="agent-video-row-title">
                      <strong>{session.type}</strong>
                      <span className={`video-status-pill video-status-${session.status}`}>
                        {formatStatus(session.status)}
                      </span>
                    </div>
                    <p>{session.topic || "No topic provided"}</p>
                    <small>
                      {session.user.emailMasked || "Customer"} ·{" "}
                      {session.createdAt
                        ? new Date(session.createdAt).toLocaleString()
                        : "New"}
                    </small>
                  </div>
                  <div className="agent-video-row-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => assignSession(session)}
                      disabled={isBusy || Boolean(session.assignedAgentId)}
                    >
                      Assign
                    </Button>
                    <Button
                      type="button"
                      onClick={() => joinSession(session)}
                      disabled={isBusy || ["ended", "cancelled", "failed", "missed"].includes(session.status)}
                    >
                      Join
                    </Button>
                  </div>
                </article>
              );
            })
          )}
        </Card>

        <Card className="agent-video-stage">
          <div className="video-stage-header">
            <div>
              <h2>{activeSession ? "Joined session" : "Agent stage"}</h2>
              <p>
                {activeSession
                  ? `${activeSession.type} · ${formatStatus(activeSession.status)}`
                  : "Join a waiting session to open the meeting here."}
              </p>
            </div>
            {activeSession ? (
              <Button
                type="button"
                variant="danger"
                onClick={endActiveSession}
                disabled={isBusy}
              >
                <PhoneOff size={18} />
                End
              </Button>
            ) : null}
          </div>
          {activeSession && jitsi ? (
            <JitsiMeeting
              jitsi={jitsi}
              displayName={displayName}
              onError={setError}
              onLeft={endActiveSession}
            />
          ) : (
            <div className="video-empty-stage">
              <Video aria-hidden="true" />
              <h3>No meeting selected</h3>
              <p>Customer financial details are not shown in this queue.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

