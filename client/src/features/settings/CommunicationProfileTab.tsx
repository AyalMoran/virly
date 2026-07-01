import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { CommunicationProfile, CommunicationProfileUserInput } from "../../lib/types";
import { Card } from "../../components/Primitives";

const MEMORY_MAX = 1000;

const DIALS: { key: keyof CommunicationProfileUserInput; label: string; options: string[] }[] = [
  { key: "formality", label: "Formality", options: ["casual", "neutral", "formal"] },
  { key: "verbosity", label: "Detail", options: ["brief", "standard", "detailed"] },
  { key: "complexity", label: "Language", options: ["simple", "standard", "expert"] },
  { key: "humor", label: "Humor", options: ["none", "light", "playful"] },
  { key: "pace", label: "Pace", options: ["step_by_step", "standard"] },
];

function draftFrom(p: CommunicationProfile): CommunicationProfileUserInput {
  return {
    formality: p.formality?.value,
    verbosity: p.verbosity?.value,
    complexity: p.complexity?.value,
    humor: p.humor?.value,
    pace: p.pace?.value,
    memory: p.memory,
  };
}

export function CommunicationProfileTab() {
  const [draft, setDraft] = useState<CommunicationProfileUserInput>({ memory: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .communicationProfile()
      .then((res) => {
        if (active) setDraft(draftFrom(res.communicationProfile));
      })
      .catch((e) => {
        if (active)
          setError(e instanceof ApiError ? e.message : "Could not load your preferences.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const save = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.updateCommunicationProfile(draft);
      setDraft(draftFrom(res.communicationProfile));
      setSuccess("Saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setIsSaving(false);
    }
  };

  const reset = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.resetCommunicationProfile();
      setDraft(draftFrom(res.communicationProfile));
      setSuccess("Reset.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reset.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="settings-comms-card">
      <h2>How Virly talks to you</h2>
      <p>Virly adapts its tone to you and remembers your preferences. Everything here is yours to edit.</p>
      {isLoading ? (
        <p>Loading your preferences...</p>
      ) : (
        <>
          {error && (
            <p role="alert" className="settings-error">
              {error}
            </p>
          )}
          {success && <p className="settings-success">{success}</p>}
          <div className="settings-comms-dials">
            {DIALS.map((dial) => (
              <label key={dial.key}>
                {dial.label}
                <select
                  value={(draft[dial.key] as string) ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [dial.key]: e.target.value || undefined }))
                  }
                >
                  <option value="">Auto</option>
                  {dial.options.map((o) => (
                    <option key={o} value={o}>
                      {o.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <label className="settings-comms-memory">
            What Virly remembers about how you like to chat
            <textarea
              value={draft.memory ?? ""}
              maxLength={MEMORY_MAX}
              rows={5}
              onChange={(e) => setDraft((d) => ({ ...d, memory: e.target.value }))}
            />
            <span className="settings-comms-count">
              {(draft.memory ?? "").length}/{MEMORY_MAX}
            </span>
          </label>
          <div className="settings-comms-actions">
            <button type="button" onClick={save} disabled={isSaving}>
              Save
            </button>
            <button type="button" onClick={reset} disabled={isSaving}>
              Reset
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
