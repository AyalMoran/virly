

/**
 * Application error carrying an HTTP status and optional machine-readable code.
 *
 * Throw this from services and routes instead of decorating a plain Error with
 * `Object.assign(err, { status })`. The central error handler
 * (middleware/error-handler.ts) reads `status` and renders `toResponseBody()`,
 * so handlers only need `next(error)` — no per-route status mapping.
 *
 * Because an AppError is thrown deliberately, its `message` is treated as
 * client-facing at any status. Plain Errors that reach the handler are NOT
 * (their message is hidden behind a generic 500) to avoid leaking internals.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, options?: { code?: string }) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = options?.code;
  }

  /**
   * The JSON body sent to the client. Subclasses may override to add fields
   * (e.g. VideoSessionServiceError adds `error`) while keeping the status-aware
   * rendering centralized in the error handler.
   */
  toResponseBody(): Record<string, unknown> {
    return {
      message: this.message,
      ...(this.code ? { code: this.code } : {})
    };
  }
}
