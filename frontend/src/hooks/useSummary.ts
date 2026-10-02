import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

/** Totals for a finished job (only ask once the job has completed: the API answers 409 before). */
export function useSummary(jobId: string) {
  return useQuery({
    queryKey: ["summary", jobId],
    queryFn: () => api.getSummary(jobId),
    staleTime: Infinity, // a completed job's numbers never change
  });
}
