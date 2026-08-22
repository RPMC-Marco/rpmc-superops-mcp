/**
 * SuperOps GraphQL client.
 *
 * Substantially adapted from computask/superops-mcp src/client.ts
 * (Apache-2.0, commit 85b24ee9f203637b680858cd0abdd1bf5d303f9e),
 * itself derived from wyre-technology/superops-mcp.
 *
 * RPMC removed Cloudflare execution-budget coupling, never retries mutations,
 * enforces the published 100 req/min limit locally, and always sends CustomerSubDomain.
 */

import type { AppConfig, SuperOpsRegion } from "../config.js";
import { parseSuperOpsJson } from "./json-ids.js";
import { MinuteLimiter } from "./limiter.js";
import {
  SuperOpsError,
  SuperOpsHttpError,
  SuperOpsMalformedResponseError,
  SuperOpsNetworkError,
  SuperOpsRateLimitError,
  SuperOpsTimeoutError,
} from "./errors.js";

export const API_ENDPOINTS = {
  us: "https://api.superops.ai/msp",
  eu: "https://euapi.superops.ai/msp",
} as const;

export interface SuperOpsCredentials {
  apiToken: string;
  subdomain: string;
  region: SuperOpsRegion;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{
    message?: string;
    path?: Array<string | number>;
    locations?: unknown;
    extensions?: Record<string, unknown>;
  }>;
}

export interface ClientOptions {
  requestTimeoutMs: number;
  maxReadRetries: number;
  maxRetryDurationMs: number;
  fetchImpl?: typeof fetch;
  limiter?: MinuteLimiter;
}

function classifyGraphQLRequest(query: string): { operationType: "query" | "mutation" | "unknown" } {
  const match = query.replace(/#[^\r\n]*/g, " ").match(/\b(query|mutation)\b/i);
  const raw = match?.[1]?.toLowerCase();
  if (raw === "mutation") return { operationType: "mutation" };
  if (raw === "query") return { operationType: "query" };
  return { operationType: "unknown" };
}

export class SuperOpsClient {
  private readonly endpoint: string;
  private readonly limiter: MinuteLimiter;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly credentials: SuperOpsCredentials,
    private readonly options: ClientOptions
  ) {
    this.endpoint = API_ENDPOINTS[credentials.region];
    this.limiter = options.limiter ?? new MinuteLimiter();
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async query<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const isWrite = classifyGraphQLRequest(query).operationType === "mutation";
    if (isWrite) {
      throw new SuperOpsError("Mutations must use SuperOpsClient.mutate");
    }

    const maxAttempts = Math.max(1, this.options.maxReadRetries);
    const startedMs = Date.now();
    let attempt = 0;
    let lastError: unknown;

    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        return await this.requestOnce<T>(query, variables);
      } catch (error) {
        lastError = error;
        if (!shouldRetrySuperOpsRequest(error) || attempt >= maxAttempts) {
          throw error;
        }
        const delayMs = retryDelayMs(error, attempt);
        if (Date.now() - startedMs + delayMs > this.options.maxRetryDurationMs) {
          throw error;
        }
        await delay(delayMs);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /**
   * Execute one official mutation. Never retries. Callers must use the write
   * pipeline's idempotency layer instead of repeating an uncertain request.
   */
  async mutate<T = unknown>(mutation: string, variables?: Record<string, unknown>): Promise<T> {
    if (classifyGraphQLRequest(mutation).operationType !== "mutation") {
      throw new SuperOpsError("SuperOpsClient.mutate requires a mutation document");
    }
    return this.requestOnce<T>(mutation, variables);
  }

  private async requestOnce<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    if (!this.limiter.tryAcquire()) {
      throw new SuperOpsRateLimitError();
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.options.requestTimeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.credentials.apiToken}`,
          CustomerSubDomain: this.credentials.subdomain,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
    } catch (error) {
      const timedOut =
        controller.signal.aborted || (error instanceof Error && error.name === "AbortError");
      throw timedOut
        ? new SuperOpsTimeoutError("SuperOps request timed out.")
        : new SuperOpsNetworkError(error instanceof Error ? error.message : String(error));
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new SuperOpsHttpError(
        `HTTP error: ${response.status} ${response.statusText}`,
        response.status,
        response.statusText,
        retryAfterFromHeaders(response.headers)
      );
    }

    let result: GraphQLResponse<T>;
    try {
      const text = await response.text();
      result = parseSuperOpsJson(text) as GraphQLResponse<T>;
    } catch (error) {
      throw new SuperOpsMalformedResponseError(
        error instanceof Error ? error.message : String(error)
      );
    }

    if (result.errors && result.errors.length > 0) {
      const graphError = result.errors[0];
      throw new SuperOpsError(
        graphError.message || "SuperOps GraphQL error",
        typeof graphError.extensions?.code === "string" ? graphError.extensions.code : undefined,
        retryAfterFromGraphQLError(graphError),
        graphError.extensions,
        response.status
      );
    }

    if (!result.data) {
      throw new SuperOpsMalformedResponseError("No data returned from GraphQL query");
    }

    return result.data;
  }
}

export function clientFromConfig(config: AppConfig, fetchImpl?: typeof fetch): SuperOpsClient {
  return new SuperOpsClient(
    {
      apiToken: config.superopsApiToken,
      subdomain: config.superopsSubdomain,
      region: config.superopsRegion,
    },
    {
      requestTimeoutMs: config.requestTimeoutMs,
      maxReadRetries: config.maxReadRetries,
      maxRetryDurationMs: config.maxRetryDurationMs,
      fetchImpl,
    }
  );
}

export function shouldRetrySuperOpsRequest(error: unknown): boolean {
  if (error instanceof SuperOpsHttpError) {
    return error.status === 429 || (error.status >= 500 && error.status < 600);
  }
  if (error instanceof SuperOpsError) {
    return isGraphQLRateLimit(error) || isRetryableGraphQLServerError(error);
  }
  return error instanceof SuperOpsNetworkError && !(error instanceof SuperOpsTimeoutError);
}

function isGraphQLRateLimit(error: SuperOpsError): boolean {
  const code = (error.code ?? "").toLowerCase();
  const message = error.message.toLowerCase();
  const extensions = error.extensions ? JSON.stringify(error.extensions).toLowerCase() : "";
  if (/\bnot\s+(a\s+)?rate[-\s]?limit(?:ed|ing)?\b/.test(message)) {
    return false;
  }
  return (
    code.includes("rate") ||
    code.includes("thrott") ||
    code === "too_many_requests" ||
    extensions.includes("rate_limit_exceeded") ||
    /\b(rate[-\s]?limit(?:ed|ing)?|too many requests|throttl(?:e|ed|ing))\b/i.test(error.message)
  );
}

function isRetryableGraphQLServerError(error: SuperOpsError): boolean {
  const code = (error.code ?? "").toLowerCase();
  const message = error.message.toLowerCase();
  return (
    code.includes("timeout") ||
    code.includes("temporar") ||
    code.includes("internal") ||
    message.includes("temporarily unavailable") ||
    message.includes("service unavailable")
  );
}

function retryAfterFromHeaders(headers: Headers): number | undefined {
  return (
    parseRetryAfter(headers.get("Retry-After")) ??
    parseRateLimitReset(headers.get("X-RateLimit-Reset")) ??
    parseRateLimitReset(headers.get("RateLimit-Reset"))
  );
}

function retryAfterFromGraphQLError(error: {
  extensions?: Record<string, unknown>;
}): number | undefined {
  const extensions = error.extensions;
  if (!extensions) return undefined;
  return parseRetryAfterValue(extensions.retryAfter) ?? parseRetryAfterValue(extensions.retry_after);
}

function parseRetryAfterValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string") return parseRetryAfter(value);
  return undefined;
}

function parseRateLimitReset(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  const now = Date.now();
  if (parsed > 1_000_000_000_000) return Math.max(0, Math.ceil((parsed - now) / 1000));
  if (parsed > 1_000_000_000) return Math.max(0, Math.ceil(parsed - now / 1000));
  return parsed;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) return Math.max(0, Math.ceil((dateMs - Date.now()) / 1000));
  return undefined;
}

function retryDelayMs(error: unknown, attempt: number): number {
  const retryAfterSeconds =
    error instanceof SuperOpsHttpError || error instanceof SuperOpsError ? error.retryAfter : undefined;
  if (typeof retryAfterSeconds === "number") {
    return Math.min(5_000, Math.max(0, Math.ceil(retryAfterSeconds * 1000)));
  }
  const base = 100 * 2 ** Math.max(0, attempt - 1);
  return Math.min(2_000, Math.ceil(base));
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
