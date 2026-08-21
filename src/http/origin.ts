/**
 * Origin and Host policy for Streamable HTTP (DNS-rebinding mitigation).
 *
 * Uses MCP SDK v2 `validateOriginHeader` / `validateHostHeader` for the actual
 * checks. RPMC owns allowlist parsing, IPv6 dual-form normalization, and the
 * HTTP 403 envelope so we do not echo header values to clients.
 *
 * This is not a substitute for Bearer MCP authentication.
 */

import { validateHostHeader, validateOriginHeader } from "@modelcontextprotocol/server";
import { effectiveHostnameAllowlist } from "./hostnames.js";

export function evaluateOrigin(
  originHeader: string | string[] | undefined,
  configuredHostnames: string[]
): { allowed: boolean; reason: string } {
  if (Array.isArray(originHeader)) {
    return { allowed: false, reason: "multiple Origin headers" };
  }
  const allowlist = effectiveHostnameAllowlist(configuredHostnames);
  const result = validateOriginHeader(originHeader ?? "", allowlist);
  if (result.ok) {
    return { allowed: true, reason: originHeader ? "origin allowed" : "origin omitted" };
  }
  return { allowed: false, reason: result.errorCode };
}

export function evaluateHost(
  hostHeader: string | string[] | undefined,
  configuredHostnames: string[]
): { allowed: boolean; reason: string } {
  if (Array.isArray(hostHeader)) {
    return { allowed: false, reason: "multiple Host headers" };
  }
  const allowlist = effectiveHostnameAllowlist(configuredHostnames);
  const result = validateHostHeader(hostHeader, allowlist);
  if (result.ok) {
    return { allowed: true, reason: "host allowed" };
  }
  return { allowed: false, reason: result.errorCode };
}
