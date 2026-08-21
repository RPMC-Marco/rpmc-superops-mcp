import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

/**
 * RFC 6750 Bearer: scheme (case-insensitive) + exactly one space + token.
 * Duplicate Authorization headers are rejected.
 */
const BEARER = /^Bearer ([^ \t]+)$/i;

export function extractBearerToken(headers: IncomingHttpHeaders): string | undefined {
  const raw = headers.authorization;
  if (raw === undefined) return undefined;
  if (Array.isArray(raw)) return undefined;
  const match = BEARER.exec(raw.trim());
  return match?.[1];
}

export function tokensEqual(provided: string, expected: string): boolean {
  const left = createHash("sha256").update(provided).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

export function authorizeMcpRequest(
  headers: IncomingHttpHeaders,
  expectedToken: string | undefined
): boolean {
  if (!expectedToken) return false;
  const provided = extractBearerToken(headers);
  if (!provided) return false;
  return tokensEqual(provided, expectedToken);
}
