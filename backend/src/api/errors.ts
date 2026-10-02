import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

import { getLogger } from "../logger";

const log = getLogger("app.api");

// An error with an HTTP status. The client gets {"detail": message}, which the frontend shows.
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);

  if (err instanceof HttpError) {
    res.status(err.status).json({ detail: err.message });
    return;
  }
  if (err instanceof ZodError) {
    const detail = err.issues.map((i) => ({ loc: i.path, msg: i.message, type: i.code }));
    res.status(422).json({ detail });
    return;
  }
  // Malformed JSON bodies (body-parser) carry their own 4xx status.
  const status = (err as { status?: number }).status;
  if (status && status >= 400 && status < 500) {
    res.status(status).json({ detail: "Invalid request" });
    return;
  }

  log.error({ err }, "request_crashed");
  res.status(500).json({ detail: "Internal Server Error" });
};
