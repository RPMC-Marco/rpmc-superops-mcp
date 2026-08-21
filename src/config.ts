/**
 * RPMC process configuration.
 *
 * `cleanCredential` is substantially adapted from wyre-technology/superops-mcp
 * `src/client.ts` (Apache-2.0, commit d3f900ca81506b1d62a027d2b0222be05d240415):
 * placeholder / empty-string stripping for environment credentials.
 */

import { parseHostnameAllowlist } from "./http/hostnames.js";

const CONFIG_PLACEHOLDER = /^\$\{.*\}$/;
export const HTTP_AUTH_TOKEN_MIN_LENGTH = 32;

export function cleanCredential(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || CONFIG_PLACEHOLDER.test(trimmed)) return undefined;
  return trimmed;
}

export type SuperOpsRegion = "us" | "eu";
export type Transport = "stdio" | "http";

export interface AppConfig {
  transport: Transport;
  httpHost: string;
  httpPort: number;
  mcpAuthToken?: string;
  allowedOriginHostnames: string[];
  allowedHostHostnames: string[];
  superopsApiToken: string;
  superopsSubdomain: string;
  superopsRegion: SuperOpsRegion;
  requestTimeoutMs: number;
  maxReadRetries: number;
  maxRetryDurationMs: number;
  logLevel: string;
}

function requireCredential(name: string, value: string | undefined): string {
  const cleaned = cleanCredential(value);
  if (!cleaned) {
    throw new Error(`${name} is required`);
  }
  return cleaned;
}

function parseRegion(value: string | undefined): SuperOpsRegion {
  const cleaned = cleanCredential(value) ?? "us";
  if (cleaned !== "us" && cleaned !== "eu") {
    throw new Error("SUPEROPS_REGION must be us or eu");
  }
  return cleaned;
}

function parsePositiveInt(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const transport = (cleanCredential(env.MCP_TRANSPORT) ?? "stdio") as string;
  if (transport !== "stdio" && transport !== "http") {
    throw new Error("MCP_TRANSPORT must be stdio or http");
  }

  let mcpAuthToken: string | undefined;
  if (transport === "http") {
    mcpAuthToken = requireCredential("MCP_AUTH_TOKEN", env.MCP_AUTH_TOKEN);
    if (mcpAuthToken.length < HTTP_AUTH_TOKEN_MIN_LENGTH) {
      throw new Error(`MCP_AUTH_TOKEN must be at least ${HTTP_AUTH_TOKEN_MIN_LENGTH} characters`);
    }
  } else {
    mcpAuthToken = cleanCredential(env.MCP_AUTH_TOKEN);
  }

  const superopsApiToken = requireCredential("SUPEROPS_API_TOKEN", env.SUPEROPS_API_TOKEN);
  const superopsSubdomain = requireCredential("SUPEROPS_SUBDOMAIN", env.SUPEROPS_SUBDOMAIN);
  const allowedOriginHostnames = parseHostnameAllowlist(env.MCP_ALLOWED_ORIGINS, "MCP_ALLOWED_ORIGINS");
  const explicitHosts = parseHostnameAllowlist(env.MCP_ALLOWED_HOSTS, "MCP_ALLOWED_HOSTS");

  return {
    transport,
    httpHost: cleanCredential(env.MCP_HTTP_HOST) ?? "0.0.0.0",
    httpPort: parsePositiveInt("MCP_HTTP_PORT", env.MCP_HTTP_PORT, 8080),
    mcpAuthToken,
    allowedOriginHostnames,
    allowedHostHostnames: explicitHosts.length > 0 ? explicitHosts : allowedOriginHostnames,
    superopsApiToken,
    superopsSubdomain,
    superopsRegion: parseRegion(env.SUPEROPS_REGION),
    requestTimeoutMs: parsePositiveInt("SUPEROPS_REQUEST_TIMEOUT_MS", env.SUPEROPS_REQUEST_TIMEOUT_MS, 30_000),
    maxReadRetries: parsePositiveInt("SUPEROPS_MAX_READ_RETRIES", env.SUPEROPS_MAX_READ_RETRIES, 3),
    maxRetryDurationMs: parsePositiveInt(
      "SUPEROPS_MAX_RETRY_DURATION_MS",
      env.SUPEROPS_MAX_RETRY_DURATION_MS,
      20_000
    ),
    logLevel: cleanCredential(env.LOG_LEVEL) ?? "info",
  };
}
