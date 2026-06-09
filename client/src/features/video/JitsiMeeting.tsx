import { useEffect, useRef, useState } from "react";
import type { JitsiJoinConfig } from "../../lib/types";

type JitsiExternalApiInstance = {
  addListener: (event: string, handler: () => void) => void;
  dispose: () => void;
};

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (
      domain: string,
      options: Record<string, unknown>
    ) => JitsiExternalApiInstance;
  }
}

type JitsiMeetingProps = {
  jitsi: JitsiJoinConfig;
  displayName: string;
  onJoined?: () => void;
  onLeft?: () => void;
  onError?: (message: string) => void;
};

function getScriptId(domain: string) {
  return `jitsi-external-api-${domain.replace(/[^a-z0-9_-]/gi, "-")}`;
}

function loadJitsiScript(domain: string) {
  if (window.JitsiMeetExternalAPI) {
    return Promise.resolve();
  }

  const existingScript = document.getElementById(getScriptId(domain)) as
    | HTMLScriptElement
    | null;
  if (existingScript) {
    return new Promise<void>((resolve, reject) => {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Unable to load the video call runtime.")),
        { once: true }
      );
    });
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = getScriptId(domain);
    script.src = `https://${domain}/external_api.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load the video call runtime."));
    document.body.appendChild(script);
  });
}

export function JitsiMeeting({
  jitsi,
  displayName,
  onJoined,
  onLeft,
  onError
}: JitsiMeetingProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<JitsiExternalApiInstance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;

    async function startMeeting() {
      try {
        setLoading(true);
        await loadJitsiScript(jitsi.domain);

        if (disposed || !containerRef.current || !window.JitsiMeetExternalAPI) {
          return;
        }

        const api = new window.JitsiMeetExternalAPI(jitsi.domain, {
          roomName: jitsi.roomName,
          parentNode: containerRef.current,
          ...(jitsi.jwt ? { jwt: jitsi.jwt } : {}),
          width: "100%",
          height: "100%",
          userInfo: {
            displayName
          },
          configOverwrite: jitsi.configOverwrite,
          interfaceConfigOverwrite: jitsi.interfaceConfigOverwrite
        });

        api.addListener("videoConferenceJoined", () => onJoined?.());
        api.addListener("videoConferenceLeft", () => onLeft?.());
        api.addListener("readyToClose", () => onLeft?.());
        apiRef.current = api;
        setLoading(false);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to start the video call.";
        setLoading(false);
        onError?.(message);
      }
    }

    startMeeting();

    return () => {
      disposed = true;
      if (apiRef.current) {
        apiRef.current.dispose();
        apiRef.current = null;
      }
    };
  }, [displayName, jitsi, onError, onJoined, onLeft]);

  return (
    <div className="jitsi-meeting-shell">
      {loading ? <div className="video-loading">Preparing secure video...</div> : null}
      <div ref={containerRef} className="jitsi-meeting-frame" />
    </div>
  );
}
