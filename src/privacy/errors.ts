import {
  SuperOpsError,
  SuperOpsHttpError,
  SuperOpsMalformedResponseError,
  SuperOpsRateLimitError,
  SuperOpsTimeoutError,
} from "../superops/errors.js";
import { sanitizeErrorText } from "./safe-output.js";

const MUTATION_GUARD = "Mutations must use SuperOpsClient.mutate";
const SAFE_TOKEN = /^[a-zA-Z0-9_]{1,64}$/;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Codes/attribute names only. Never copies SuperOps message text or ticket bodies. */
export function sanitizedSuperOpsClientError(error: SuperOpsError): string | undefined {
  const raw = error.extensions?.clientError;
  const first = Array.isArray(raw) ? asRecord(raw[0]) : asRecord(raw);
  if (!first) return undefined;
  const code = typeof first.code === "string" && SAFE_TOKEN.test(first.code) ? first.code : undefined;
  if (!code) return undefined;
  const param = asRecord(first.param);
  const attrs = Array.isArray(param?.attributes)
    ? param.attributes
        .filter((item): item is string => typeof item === "string" && SAFE_TOKEN.test(item))
        .slice(0, 8)
    : [];
  return attrs.length ? `${code}: ${attrs.join(",")}` : code;
}

export function toClientSafeError(error: unknown): string {
  if (error instanceof SuperOpsTimeoutError) {
    return "SuperOps request timed out";
  }
  if (error instanceof SuperOpsRateLimitError) {
    return "SuperOps rate limit exceeded";
  }
  if (error instanceof SuperOpsHttpError) {
    return "SuperOps HTTP error";
  }
  if (error instanceof SuperOpsMalformedResponseError) {
    return "SuperOps returned an unexpected response";
  }
  if (error instanceof SuperOpsError) {
    if (error.message === MUTATION_GUARD) {
      return MUTATION_GUARD;
    }
    const clientError = sanitizedSuperOpsClientError(error);
    return clientError ? `SuperOps request failed (${clientError})` : "SuperOps request failed";
  }
  if (error instanceof Error) {
    return sanitizeErrorText(error.message);
  }
  return "tool failed";
}

export function auditErrorSummary(error: unknown, clientMessage: string): string {
  if (error instanceof Error && error.message && error.message !== clientMessage) {
    return sanitizeErrorText(`${clientMessage}: ${error.message}`);
  }
  return sanitizeErrorText(clientMessage);
}
