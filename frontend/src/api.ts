import type { JobState, JobSummary, RowsPage, UploadResponse } from "./types";

/**
 * Tiny fetch wrapper: throws a readable Error for non-2xx responses.
 * T is the shape of the JSON the endpoint returns.
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * API client for our backend. All methods return a Promise that resolves to the JSON response.
 */
export const api = {
  createUpload: (filename: string) =>
    request<UploadResponse>("/api/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename }),
    }),
  startJob: (jobId: string) =>
    request<JobState>(`/api/jobs/${jobId}/start`, { method: "POST" }),
  getRows: (jobId: string, page: number, pageSize: number) =>
    request<RowsPage>(`/api/jobs/${jobId}/rows?page=${page}&page_size=${pageSize}`),
  getSummary: (jobId: string) => request<JobSummary>(`/api/jobs/${jobId}/summary`),
};

/**
 * Sends the file STRAIGHT to Garage using the pre-signed URL.
 * Our API never sees these bytes — it only handed out a one-time permission.
 * @param uploadUrl - the pre-signed URL returned by our API
 * @param file - the file to upload
 */
export async function uploadToStorage(uploadUrl: string, file: Blob) {
  const res = await fetch(uploadUrl, { method: "PUT", body: file });
  if (!res.ok) throw new Error(`Upload to storage failed (${res.status})`);
}
