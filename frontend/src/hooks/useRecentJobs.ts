import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { ACTIVE_STATUSES } from "../lib/status";

/** The latest imports, newest first. Refreshes by itself while any of them is still running. */
export function useRecentJobs() {
  return useQuery({
    queryKey: ["jobs"],
    queryFn: () => api.listJobs(),
    refetchInterval: (query) =>
      query.state.data?.some((job) => ACTIVE_STATUSES.includes(job.status)) ? 3000 : false,
  });
}
