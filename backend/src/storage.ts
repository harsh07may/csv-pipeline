import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { S3_ACCESS_KEY, S3_BUCKET, S3_INTERNAL_ENDPOINT, S3_PUBLIC_ENDPOINT, S3_REGION, S3_SECRET_KEY } from "./config";

function s3Client(endpoint: string): S3Client {
  return new S3Client({
    endpoint,
    region: S3_REGION,
    credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
    forcePathStyle: true, // Garage needs path-style addressing
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

export const internalS3 = s3Client(S3_INTERNAL_ENDPOINT); // server-to-server calls
const publicS3 = s3Client(S3_PUBLIC_ENDPOINT); // generates pre-signed URLs the browser can reach

// A temporary URL that lets the holder PUT exactly one object. No credentials shared.
export function presignedUploadUrl(objectKey: string, expiresIn = 900): Promise<string> {
  return getSignedUrl(publicS3, new PutObjectCommand({ Bucket: S3_BUCKET, Key: objectKey }), { expiresIn });
}

export async function objectExists(objectKey: string): Promise<boolean> {
  try {
    await internalS3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: objectKey }));
    return true;
  } catch (err) {
    // Only "no such object" means missing. A permissions or server error is a real
    // failure and must not be reported to the user as "file not found".
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e.$metadata?.httpStatusCode === 404 || e.name === "NotFound" || e.name === "NoSuchKey") return false;
    throw err;
  }
}

export async function downloadFile(objectKey: string, destinationPath: string): Promise<void> {
  const res = await internalS3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: objectKey }));
  await pipeline(res.Body as Readable, createWriteStream(destinationPath));
}
