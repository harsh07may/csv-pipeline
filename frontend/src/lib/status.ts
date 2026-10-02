/** Plain-language names for the job states the API reports. */
export const STATUS_LABEL: Record<string, string> = {
  awaiting_upload: "Waiting for upload",
  queued: "Waiting for a worker",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  not_found: "Job not found",
};

/** States where a worker is still going to change the job. */
export const ACTIVE_STATUSES = ["queued", "processing"];
