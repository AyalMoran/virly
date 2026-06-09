import { useCallback, useEffect, useMemo, useState } from "react";
import { Headphones, PhoneOff, ShieldCheck, UserRound, Video } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Button, Card, ErrorBanner, PageHeader, TextareaField } from "../../components/Primitives";
import { api } from "../../lib/api";
import type {
  JitsiJoinConfig,
  VideoSession,
  VideoSessionStatus,
  VideoSessionType
} from "../../lib/types";
import { useAuth } from "../auth/AuthProvider";
import { JitsiMeeting } from "./JitsiMeeting";

function getStatusLabel(status?: VideoSessionStatus) {
  switch (status) {
    case "requested":
      return "Requested";
    case "waiting_for_agent":
      return "Waiting for agent";
    case "active":
      return "Active";
    case "ended":
      return "Ended";
    case "missed":
      return "Missed";
    case "cancelled":
      return "Cancelled";
    case "failed":
      return "Failed";
    default:
      return "Not started";
  }
}

function getSessionCopy(type: VideoSessionType) {
  return type === "sales"
    ? {
        title: "Sales consultation",
        description: "Talk through account options with a Virly sales specialist.",
        button: "Start sales video",
        topic: "Business or account upgrade question"
      }
    : {
        title: "Video support",
        description: "Get help from a Virly support agent inside the app.",
        button: "Start support video",
        topic: "Account or transfer support"
      };
}

export function VideoSessionPage() {
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const [session, setSession] = useState<VideoSession | null>(null);
  const [jitsi, setJitsi] = useState<JitsiJoinConfig | null>(null);
  const [topic, setTopic] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const displayName = useMemo(
    () => auth.user?.email.split("@")[0] || "Virly customer",
    [auth.user?.email]
  );

  useEffect(() => {
    const sessionId = searchParams.get("sessionId");
    if (!sessionId || session?.id === sessionId) {
      return;
    }

    let active = true;
    setIsBusy(true);
    setError("");
    api
      .videoSession(sessionId)
      .then((response) => {
        if (active) {
          setSession(response.session);
        }
        return api.videoJoinToken(sessionId);
      })
      .then((response) => {
        if (active) {
          setSession(response.session);
          setJitsi(response.jitsi);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to open video session."
          );
        }
      })
      .finally(() => {
        if (active) {
          setIsBusy(false);
        }
      });

    return () => {
      active = false;
    };
  }, [searchParams, session?.id]);

  const startSession = useCallback(
    async (type: VideoSessionType) => {
      setIsBusy(true);
      setError("");
      setJitsi(null);
      try {
        const fallbackTopic = getSessionCopy(type).topic;
        const createResponse = await api.createVideoSession({
          type,
          topic: topic.trim() || fallbackTopic,
          source: "dashboard",
          locale: navigator.language
        });
        setSession(createResponse.session);
        const joinResponse = await api.videoJoinToken(createResponse.session.id);
        setSession(joinResponse.session);
        setJitsi(joinResponse.jitsi);
      } catch (startError) {
        setError(
          startError instanceof Error ? startError.message : "Unable to start video."
        );
      } finally {
        setIsBusy(false);
      }
    },
    [topic]
  );

  const endSession = useCallback(async () => {
    if (!session) {
      return;
    }

    setIsBusy(true);
    setError("");
    try {
      const response = await api.endVideoSession(session.id);
      setSession(response.session);
      setJitsi(null);
    } catch (endError) {
      setError(endError instanceof Error ? endError.message : "Unable to end video.");
    } finally {
      setIsBusy(false);
    }
  }, [session]);

  const showMeeting =
    jitsi && session && !["ended", "cancelled", "failed", "missed"].includes(session.status);

  return (
    <div className="page-stack video-page">
      <PageHeader eyebrow="Secure help" title="Video calls">
        {session ? (
          <span className={`video-status-pill video-status-${session.status}`}>
            {getStatusLabel(session.status)}
          </span>
        ) : null}
      </PageHeader>

      {error ? <ErrorBanner message={error} /> : null}

      <div className="video-layout">
        <Card className="video-control-panel">
          <div className="video-intro">
            <span className="video-intro-icon" aria-hidden="true">
              <ShieldCheck />
            </span>
            <div>
              <h2>Start a secure app video session</h2>
              <p>
                Video support can guide you, but money movement still requires the
                normal in-app confirmation flow.
              </p>
            </div>
          </div>

          <TextareaField
            label="Topic"
            name="video-topic"
            value={topic}
            maxLength={200}
            hint="Optional. Keep it short and do not include passwords, card numbers, or private documents."
            onChange={(event) => setTopic(event.target.value)}
          />

          <div className="video-choice-grid">
            {(["support", "sales"] as const).map((type) => {
              const copy = getSessionCopy(type);
              const Icon = type === "support" ? Headphones : UserRound;
              return (
                <button
                  key={type}
                  type="button"
                  className="video-choice"
                  disabled={isBusy}
                  onClick={() => startSession(type)}
                >
                  <span className="video-choice-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span>
                    <strong>{copy.title}</strong>
                    <small>{copy.description}</small>
                  </span>
                  <span className="video-choice-action">{copy.button}</span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="video-stage-card">
          <div className="video-stage-header">
            <div>
              <h2>{session ? getSessionCopy(session.type).title : "No active call"}</h2>
              <p>{session ? getStatusLabel(session.status) : "Choose a session type to begin."}</p>
            </div>
            {session && !["ended", "cancelled", "failed", "missed"].includes(session.status) ? (
              <Button
                type="button"
                variant="danger"
                onClick={endSession}
                disabled={isBusy}
              >
                <PhoneOff size={18} />
                End
              </Button>
            ) : null}
          </div>

          {showMeeting ? (
            <JitsiMeeting
              jitsi={jitsi}
              displayName={displayName}
              onError={setError}
              onLeft={endSession}
            />
          ) : (
            <div className="video-empty-stage">
              <Video aria-hidden="true" />
              <h3>{session ? getStatusLabel(session.status) : "Ready when you are"}</h3>
              <p>
                {session?.status === "cancelled"
                  ? "The session was cancelled before an agent joined."
                  : session?.status === "ended"
                    ? "The session has ended."
                    : session?.status === "failed"
                      ? "The session could not be started."
                      : "Your meeting will appear here after the secure join config is issued."}
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
