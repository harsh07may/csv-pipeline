import { useCallback, useEffect, useState } from "react";

const PARAM = "job";

const readFromUrl = () => new URLSearchParams(window.location.search).get(PARAM);

/**
 * The job being shown, kept in the address bar (?job=<id>) instead of only in memory.
 * A refresh, a bookmark or a shared link then reopens the same job, and the browser's
 * back button steps between jobs. The job itself lives in the database, not in the page.
 */
export function useJobId(): [string | null, (jobId: string | null) => void] {
  const [jobId, setJobIdState] = useState<string | null>(readFromUrl);

  // Back/forward buttons change the URL without reloading: follow them.
  useEffect(() => {
    const onPopState = () => setJobIdState(readFromUrl());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const setJobId = useCallback((next: string | null) => {
    const url = new URL(window.location.href);
    if (next) url.searchParams.set(PARAM, next);
    else url.searchParams.delete(PARAM);
    window.history.pushState(null, "", url);
    setJobIdState(next);
  }, []);

  return [jobId, setJobId];
}
