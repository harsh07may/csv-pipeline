import { useState } from "react";
import { api, uploadToStorage } from "../api.js";

interface UploaderProps {
  onJobStarted: (jobId: string) => void;
}

function Uploader({ onJobStarted }: UploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<string | null>(null); // human-readable current step
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    if (!file) return; // nothing chosen yet
    setError(null);
    try {
      setStep("Requesting upload URL…");
      const { job_id, upload_url } = await api.createUpload(file.name); // 1. ask API
      setStep("Uploading to storage…");
      await uploadToStorage(upload_url, file); // 2. PUT to Garage
      setStep("Queueing job…");
      await api.startJob(job_id); // 3. enqueue
      onJobStarted(job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStep(null);
    }
  }

  return (
    <section className="card">
      <input
        type="file"
        accept=".csv"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <button onClick={handleUpload} disabled={!file || step !== null}>
        {step ?? "Upload and process"}
      </button>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

export default Uploader;
