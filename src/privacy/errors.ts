import {
  SuperOpsError,
  SuperOpsHttpError,
  SuperOpsMalformedResponseError,
  SuperOpsRateLimitError,
  SuperOpsTimeoutError,
} from "../superops/errors.js";
import { sanitizeErrorText } from "./safe-output.js";

const PHASE1_MUTATION_GUARD = "Mutations are disabled in the RPMC Phase 1 client";

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
    if (error.message === PHASE1_MUTATION_GUARD) {
      return PHASE1_MUTATION_GUARD;
    }
    return "SuperOps request failed";
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
