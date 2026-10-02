import { useState } from "react";
import { useUploadJob } from "../hooks/useUploadJob";
import { formatBytes } from "../lib/format";

interface UploaderProps {
  onJobStarted: (jobId: string) => void;
}

function Uploader({ onJobStarted }: UploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const { upload, isPending, step, error } = useUploadJob(onJobStarted);

  function choose(candidate: File | undefined) {
    if (!candidate) return;
    if (!candidate.name.toLowerCase().endsWith(".csv")) {
      setPickError("Choose a file that ends in .csv.");
      return;
    }
    setPickError(null);
    setFile(candidate);
  }

  function handleImport() {
    if (file) upload(file, { onSuccess: () => setFile(null) });
  }

  const message = pickError ?? error;

  return (
    <section className="panel uploader" aria-label="Upload a CSV">
      <label
        className="dropzone"
        data-dragging={dragging}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          choose(e.dataTransfer.files[0]);
        }}
      >
        <input
          className="visually-hidden"
          type="file"
          accept=".csv"
          disabled={isPending}
          onChange={(e) => choose(e.target.files?.[0])}
        />
        <span className="dropzone-title">{file ? file.name : "Choose a CSV file or drop it here"}</span>
        <span className="dropzone-hint">
          {file
            ? formatBytes(file.size)
            : "Columns: order_id, customer_email, amount, currency, order_date, country"}
        </span>
      </label>

      <div className="actions">
        <button className="button" onClick={handleImport} disabled={!file || isPending}>
          {step ?? "Import orders"}
        </button>
        {/* A plain file in public/: no code needed, and it shows the exact format we accept. */}
        <a className="button button-quiet" href="/sample-orders.csv" download>
          Download sample CSV
        </a>
      </div>

      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
    </section>
  );
}

export default Uploader;
