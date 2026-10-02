import { useState } from "react";
import JobProgress from "./components/JobProgress";
import RowsTable from "./components/RowsTable";
import Summary from "./components/Summary";
import Uploader from "./components/Uploader";
import { useJobEvents } from "./hooks/useJobEvents";

function App() {
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJobEvents(jobId);

  return (
    <main className="page">
      <header className="masthead">
        <h1>Order import</h1>
        <p>Upload a CSV of orders. Valid rows are saved, rejected rows are listed with the reason.</p>
      </header>

      <Uploader onJobStarted={setJobId} />

      {job && <JobProgress job={job} />}

      {jobId && job?.status === "completed" && (
        <>
          <Summary jobId={jobId} />
          {/* key: a new job starts back on page 1 */}
          <RowsTable key={jobId} jobId={jobId} />
        </>
      )}
    </main>
  );
}

export default App;
