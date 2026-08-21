import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

export function extractBearerToken(headers: IncomingHttpHeaders): string | undefined {
  const raw = headers.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;
  const match = /^Bearer\s+(\S+)/i.exec(value.trim());
  return match?.[1];
}

export function tokensEqual(provided: string, expected: string): boolean {
  const left = createHash("sha256").update(provided).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

export function authorizeMcpRequest(
  headers: IncomingHttpHeaders,
  expectedToken: string
): boolean {
  const provided = extractBearerToken(headers);
  if (!provided) return false;
  return tokensEqual(provided, expectedToken);
}
