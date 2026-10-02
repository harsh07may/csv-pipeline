// One-time: allow the React dev server's origin to PUT files straight into the bucket.
// Without CORS the browser blocks the cross-origin upload (localhost:5173 -> localhost:3900).
// Run via: docker compose exec -T api npm run setup-storage
import { PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { setTimeout as sleep } from "node:timers/promises";

import { FRONTEND_ORIGIN, S3_BUCKET } from "./config";
import { internalS3 } from "./storage";

const CORS_RULES = {
  CORSRules: [
    {
      AllowedOrigins: [FRONTEND_ORIGIN],
      AllowedMethods: ["PUT"],
      AllowedHeaders: ["*"],
      ExposeHeaders: ["ETag"],
      MaxAgeSeconds: 3600,
    },
  ],
};

async function main(attempts = 10) {
  // Garage creates the bucket a moment after it starts, so retry briefly instead of
  // failing if this runs right after `docker compose up`.
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await internalS3.send(new PutBucketCorsCommand({ Bucket: S3_BUCKET, CORSConfiguration: CORS_RULES }));
      console.log(`CORS set on bucket '${S3_BUCKET}' for ${FRONTEND_ORIGIN}`);
      return;
    } catch (err) {
      if (attempt === attempts) throw err;
      console.log(`Garage not ready yet (${(err as Error).name}), retrying...`);
      await sleep(2000);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
