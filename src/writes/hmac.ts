import { createHmac, hkdfSync } from "node:crypto";
import type { AppConfig } from "../config.js";

export const HMAC_PURPOSE_CONFIRMATION = "write-confirmation-v1";
export const HMAC_PURPOSE_GRANT = "authorization-grant-v1";

function purposeKey(config: AppConfig, purpose: string): Buffer {
  const material = config.mcpAuthToken || config.superopsApiToken;
  return Buffer.from(hkdfSync("sha256", material, "rpmc-superops-mcp", purpose, 32));
}

function sign(payload: string, config: AppConfig, purpose: string): string {
  return createHmac("sha256", purposeKey(config, purpose)).update(payload).digest("base64url");
}

function macEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

export function mintHmacToken(value: object, config: AppConfig, purpose: string): string {
  const payload = Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return `${payload}.${sign(payload, config, purpose)}`;
}

export function verifyHmacToken<T>(token: string | undefined, config: AppConfig, purpose: string): T | undefined {
  if (!token || !token.includes(".")) return undefined;
  const splitAt = token.lastIndexOf(".");
  const payload = token.slice(0, splitAt);
  const mac = token.slice(splitAt + 1);
  if (!payload || !mac) return undefined;
  if (!macEqual(sign(payload, config, purpose), mac)) return undefined;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
  } catch {
    return undefined;
  }
}
