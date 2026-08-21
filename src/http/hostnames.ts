/**
 * Shared hostname allowlist parsing for Host and Origin DNS-rebinding guards.
 * Config loading and request validation must use this module so they cannot drift.
 */

import { localhostAllowedHostnames } from "@modelcontextprotocol/server";

export class HostnameAllowlistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostnameAllowlistError";
  }
}

export function parseHostnameAllowlist(raw: string | undefined, envName: string): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((value) => toHostname(value, envName));
}

function toHostname(value: string, envName: string): string {
  try {
    const url = value.includes("://") ? new URL(value) : new URL(`http://${value}`);
    const hostname = url.hostname.trim().toLowerCase();
    if (!hostname) {
      throw new Error("empty hostname");
    }
    return hostname;
  } catch {
    throw new HostnameAllowlistError(`${envName} contains an invalid hostname: ${value}`);
  }
}

/**
 * SDK compare is exact `includes()`. URL.hostname for IPv6 is `::1` (no brackets),
 * while localhostAllowedHostnames() includes `[::1]`. Keep both forms.
 */
export function normalizeHostnameAllowlist(hostnames: string[]): string[] {
  const allowed = new Set<string>();
  for (const hostname of hostnames) {
    const lower = hostname.trim().toLowerCase();
    if (!lower) continue;
    allowed.add(lower);
    if (lower === "::1") allowed.add("[::1]");
    if (lower === "[::1]") allowed.add("::1");
  }
  return [...allowed];
}

export function defaultLoopbackHostnames(): string[] {
  return normalizeHostnameAllowlist([...localhostAllowedHostnames(), "::1"]);
}

export function effectiveHostnameAllowlist(configured: string[]): string[] {
  return configured.length > 0 ? normalizeHostnameAllowlist(configured) : defaultLoopbackHostnames();
}
