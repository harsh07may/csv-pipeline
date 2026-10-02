// Step 1 of the flow: the client asks where to upload its CSV.
import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";

import { db } from "../../db";
import { getLogger } from "../../logger";
import { jobs } from "../../schema";
import { presignedUploadUrl } from "../../storage";
import { HttpError } from "../errors";

export const uploadsRouter = Router();
const log = getLogger("app.api.uploads");

const UploadRequest = z.object({ filename: z.string() });

// Return a pre-signed URL to the client.
uploadsRouter.post("/uploads", async (req, res) => {
  const body = UploadRequest.parse(req.body);
  if (!body.filename.toLowerCase().endsWith(".csv")) throw new HttpError(400, "Only .csv files are accepted");

  const jobId = randomUUID();
  const objectKey = `uploads/${jobId}.csv`;
  await db.insert(jobs).values({ id: jobId, filename: body.filename, object_key: objectKey });

  log.info({ job_id: jobId, filename: body.filename }, "job_created");
  res.json({ job_id: jobId, upload_url: await presignedUploadUrl(objectKey) });
});
