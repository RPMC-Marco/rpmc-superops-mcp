/**
 * Origin policy for Streamable HTTP (DNS-rebinding mitigation).
 *
 * Missing Origin is allowed (non-browser MCP clients).
 * Present Origin must match configured hostnames, or loopback when unset.
 * This is not a substitute for Bearer MCP authentication.
 */

const DEFAULT_LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]", "::1"];

export function parseOriginAllowlist(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(toHostname);
}

function toHostname(value: string): string {
  try {
    const url = value.includes("://") ? new URL(value) : new URL(`http://${value}`);
    return url.hostname;
  } catch {
    return value.toLowerCase();
  }
}

export function effectiveOriginHostnames(configured: string[]): string[] {
  return configured.length > 0 ? configured : DEFAULT_LOOPBACK_HOSTS;
}

export function evaluateOrigin(
  originHeader: string | string[] | undefined,
  configuredHostnames: string[]
): { allowed: boolean; reason: string } {
  if (Array.isArray(originHeader)) {
    return { allowed: false, reason: "multiple Origin headers" };
  }
  if (!originHeader || originHeader.trim() === "") {
    return { allowed: true, reason: "origin omitted" };
  }
  const raw = originHeader.trim();
  if (raw === "null") {
    return { allowed: false, reason: "null origin" };
  }
  let hostname: string;
  try {
    hostname = new URL(raw).hostname;
  } catch {
    return { allowed: false, reason: "unparseable origin" };
  }
  const allowed = new Set(effectiveOriginHostnames(configuredHostnames).map((host) => host.toLowerCase()));
  if (allowed.has(hostname.toLowerCase()) || allowed.has(`[${hostname.toLowerCase()}]`)) {
    return { allowed: true, reason: "origin allowed" };
  }
  return { allowed: false, reason: "origin not allowed" };
}

export function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
