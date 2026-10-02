// Express app for the CSV pipeline: creates the app and plugs in the routers.
import "./init"; // must stay first: names the service
import "../tracing"; // starts tracing before express, pg and ioredis load

import express from "express";

import { PORT } from "../config";
import { getLogger } from "../logger";
import { errorHandler, HttpError } from "./errors";
import { requestLog } from "./middleware";
import { healthRouter } from "./routes/health";
import { jobsRouter } from "./routes/jobs";
import { uploadsRouter } from "./routes/uploads";

const log = getLogger("app.api");

// Tables are created by migrations (`npm run migrate`), which run before the server starts.
const app = express();
app.disable("x-powered-by");
app.use(requestLog);
app.use(express.json());

// Every route lives under /api; each module owns one part of the flow.
const api = express.Router();
api.use(healthRouter, uploadsRouter, jobsRouter);
app.use("/api", api);
// Unknown URLs get the same {"detail": ...} shape as every other error.
app.use(() => {
  throw new HttpError(404, "Not Found");
});
app.use(errorHandler);

const server = app.listen(PORT, () => log.info({ port: PORT }, "api_started"));
server.keepAliveTimeout = 65_000; // longer than common proxy idle timeouts
