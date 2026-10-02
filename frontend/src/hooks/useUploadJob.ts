import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, uploadToStorage } from "../api";

/**
 * The three-step upload: ask the API for a pre-signed URL, PUT the file straight to storage,
 * then tell the API to start the job. `step` says which one is running.
 */
export function useUploadJob(onStarted: (jobId: string) => void) {
  const [step, setStep] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (file: File) => {
      setStep("Requesting upload URL…");
      const { job_id, upload_url } = await api.createUpload(file.name);
      setStep("Uploading to storage…");
      await uploadToStorage(upload_url, file);
      setStep("Starting import…");
      await api.startJob(job_id);
      return job_id;
    },
    onSuccess: (jobId) => {
      onStarted(jobId);
      void queryClient.invalidateQueries({ queryKey: ["jobs"] }); // show it in Recent imports
    },
    onSettled: () => setStep(null),
  });

  return {
    upload: mutation.mutate,
    isPending: mutation.isPending,
    step,
    error: mutation.error?.message ?? null,
  };
}
