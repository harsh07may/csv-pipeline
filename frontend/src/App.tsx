import JobProgress from "./components/JobProgress";
import RecentJobs from "./components/RecentJobs";
import RowsTable from "./components/RowsTable";
import Summary from "./components/Summary";
import Uploader from "./components/Uploader";
import { useJobEvents } from "./hooks/useJobEvents";
import { useJobId } from "./hooks/useJobId";

function App() {
  const [jobId, setJobId] = useJobId(); // lives in the URL, so a refresh keeps the job
  const job = useJobEvents(jobId);

  return (
    <main className="page">
      <header className="masthead">
        <h1>Order import</h1>
        <p>Upload a CSV of orders. Valid rows are saved, rejected rows are listed with the reason.</p>
      </header>

      <Uploader onJobStarted={setJobId} />

      <RecentJobs currentJobId={jobId} onSelect={setJobId} />

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
