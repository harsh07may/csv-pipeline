import { Router } from "express";

export const healthRouter = Router();

// The smallest possible endpoint: proves the server runs and routing works.
healthRouter.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});
