import { useEffect, useState } from "react";
import type { JobState } from "../types";

// "not_found" is sent by the server for an unknown job, then it ends the stream.
const TERMINAL = ["completed", "failed", "not_found"];

// Events are partial updates (the first one is a full snapshot), so every field is optional.
export type JobUpdate = Partial<JobState>;

// Subscribes to Server-Sent Events for one job and returns its latest state.
export function useJobEvents(jobId: string | null): JobUpdate | null {
  // Remember which job the state belongs to, so a stale job is never shown for a new jobId.
  const [state, setState] = useState<{ jobId: string; job: JobUpdate } | null>(null);

  useEffect(() => {
    if (!jobId) return;

    // EventSource is built into every browser: no library, auto-reconnect included.
    const source = new EventSource(`/api/jobs/${jobId}/events`);

    source.onmessage = (event) => {
      const update = JSON.parse(event.data) as JobUpdate;
      // Merge into what we already know, unless that is a different job's state.
      setState((prev) => ({
        jobId,
        job: { ...(prev?.jobId === jobId ? prev.job : {}), ...update },
      }));
      // Close ourselves when done; otherwise EventSource would reconnect forever.
      if (update.status && TERMINAL.includes(update.status)) source.close();
    };
    // On network errors EventSource retries by itself; the server re-sends a snapshot.

    return () => source.close(); // cleanup when jobId changes or the component unmounts
  }, [jobId]);

  return state?.jobId === jobId ? state.job : null;
}
