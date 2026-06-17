import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/app-error.js";

/** Ad-hoc fields some not-yet-migrated errors still carry (pre-AppError). */
type StatusError = Error & {
  status?: unknown;
  code?: unknown;
  error?: unknown;
  supersededById?: unknown;
};

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      message: "Validation failed.",
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    });
  }

  if (error instanceof AppError) {
    return res.status(error.status).json(error.toResponseBody());
  }

  // Back-compat for errors decorated with a numeric `status`
  // (e.g. `Object.assign(new Error(), { status })`). Only 4xx messages are
  // surfaced; 5xx and un-statused errors must not leak internals to clients.
  const candidate = error as StatusError;
  const status =
    error instanceof Error && typeof candidate.status === "number"
      ? candidate.status
      : null;

  if (status !== null && status < 500) {
    return res.status(status).json({
      message: candidate.message,
      ...(typeof candidate.code === "string" ? { code: candidate.code } : {}),
      ...(typeof candidate.error === "string" ? { error: candidate.error } : {}),
      ...(candidate.supersededById !== undefined
        ? { supersededById: candidate.supersededById }
        : {})
    });
  }

  console.error("[error-handler] Unhandled error:", error);
  return res.status(status ?? 500).json({ message: "Internal server error." });
}
