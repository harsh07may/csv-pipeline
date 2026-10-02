import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../api";

export const ROWS_PAGE_SIZE = 25;

/** One page of a finished job's orders. Keeps the previous page on screen while the next loads. */
export function useRows(jobId: string, page: number) {
  return useQuery({
    queryKey: ["rows", jobId, page],
    queryFn: () => api.getRows(jobId, page, ROWS_PAGE_SIZE),
    placeholderData: keepPreviousData,
    staleTime: Infinity, // a completed job's rows never change
  });
}
