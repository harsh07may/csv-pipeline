import { useState } from "react";
import JobProgress from "./components/JobProgress";
import Uploader from "./components/Uploader";
import { useJobEvents } from "./hooks/useJobEvents";
import RowsTable from "./components/RowsTable";
import Summary from "./components/Summary";
function App() {
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJobEvents(jobId);
  return (
    <main>
      <h1>CSV order import</h1>
      <Uploader onJobStarted={setJobId} />
      {jobId && <p>Started job {jobId}</p>}
      {job && <JobProgress job={job} />}
      {jobId && job?.status === "completed" && (
        <>
          <Summary jobId={jobId} />
          <RowsTable jobId={jobId} />
        </>
      )}
    </main>
  );
}

export default App;
