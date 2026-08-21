/**
 * SuperOps GraphQL error types.
 *
 * Substantially adapted from computask/superops-mcp `src/client.ts`
 * (Apache-2.0, commit 85b24ee9f203637b680858cd0abdd1bf5d303f9e).
 * RPMC dropped Cloudflare Worker execution-budget fields and keeps HTTP/GraphQL
 * failure classes used by the standalone Node client.
 */

export class SuperOpsError extends Error {
  readonly code?: string;
  readonly retryAfter?: number;
  readonly extensions?: Record<string, unknown>;
  readonly httpStatus?: number;

  constructor(
    message: string,
    code?: string,
    retryAfter?: number,
    extensions?: Record<string, unknown>,
    httpStatus?: number
  ) {
    super(message);
    this.name = "SuperOpsError";
    this.code = code;
    this.retryAfter = retryAfter;
    this.extensions = extensions;
    this.httpStatus = httpStatus;
  }
}

export class SuperOpsHttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly retryAfter?: number;

  constructor(message: string, status: number, statusText: string, retryAfter?: number) {
    super(message);
    this.name = "SuperOpsHttpError";
    this.status = status;
    this.statusText = statusText;
    this.retryAfter = retryAfter;
  }
}

export class SuperOpsNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SuperOpsNetworkError";
  }
}

export class SuperOpsTimeoutError extends SuperOpsNetworkError {
  constructor(message: string) {
    super(message);
    this.name = "SuperOpsTimeoutError";
  }
}

export class SuperOpsMalformedResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SuperOpsMalformedResponseError";
  }
}

export class SuperOpsRateLimitError extends Error {
  constructor(message = "Local SuperOps client rate limit (100 requests/minute) exceeded") {
    super(message);
    this.name = "SuperOpsRateLimitError";
  }
}
