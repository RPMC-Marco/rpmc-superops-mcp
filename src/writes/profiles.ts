import type { ToolClassification } from "../audit.js";

export type AuthorizationProfileId = "standard_technician" | "maintenance_window" | "authorized_build";
export type ProfileCode = "A" | "B" | "C";

export interface AuthorizationProfileMeta {
  id: AuthorizationProfileId;
  code: ProfileCode;
  rulesLabel: string;
  title: string;
  autonomousThrough: ToolClassification;
  requiresHumanGrant: boolean;
}

export const AUTHORIZATION_PROFILES: Record<AuthorizationProfileId, AuthorizationProfileMeta> = {
  standard_technician: {
    id: "standard_technician",
    code: "A",
    rulesLabel: "Rules A",
    title: "Standard Technician",
    autonomousThrough: "write_visible",
    requiresHumanGrant: false,
  },
  maintenance_window: {
    id: "maintenance_window",
    code: "B",
    rulesLabel: "Rules B",
    title: "Maintenance Window",
    autonomousThrough: "disruptive",
    requiresHumanGrant: true,
  },
  authorized_build: {
    id: "authorized_build",
    code: "C",
    rulesLabel: "Rules C",
    title: "Authorized Build / Change",
    autonomousThrough: "destructive",
    requiresHumanGrant: true,
  },
};

const ALIASES: Record<string, AuthorizationProfileId> = {
  a: "standard_technician",
  rules_a: "standard_technician",
  "rules a": "standard_technician",
  standard: "standard_technician",
  standard_technician: "standard_technician",
  "standard technician": "standard_technician",
  b: "maintenance_window",
  rules_b: "maintenance_window",
  "rules b": "maintenance_window",
  maintenance: "maintenance_window",
  maintenance_window: "maintenance_window",
  "maintenance window": "maintenance_window",
  c: "authorized_build",
  rules_c: "authorized_build",
  "rules c": "authorized_build",
  authorized_build: "authorized_build",
  "authorized build": "authorized_build",
  "authorized build / change": "authorized_build",
  authorized_build_change: "authorized_build",
  "authorized_build / change": "authorized_build",
};

function normalizeProfileKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function parseAuthorizationProfile(raw: string | undefined): AuthorizationProfileId | undefined {
  if (!raw?.trim()) return undefined;
  const key = normalizeProfileKey(raw);
  return ALIASES[key] ?? ALIASES[key.replace(/\s+/g, "_")];
}

export function parseElevatedProfile(
  raw: string | undefined
): Exclude<AuthorizationProfileId, "standard_technician"> | undefined {
  const parsed = parseAuthorizationProfile(raw);
  if (parsed === "maintenance_window" || parsed === "authorized_build") return parsed;
  return undefined;
}

export function profileAcknowledged(
  typed: string | undefined,
  expected: Exclude<AuthorizationProfileId, "standard_technician">
): boolean {
  const parsed = parseElevatedProfile(typed);
  if (parsed === expected) return true;
  const compact = normalizeProfileKey(typed ?? "");
  if (expected === "maintenance_window") return compact === "b" || compact === "rules b";
  return compact === "c" || compact === "rules c";
}

export function autonomousCeiling(profile: AuthorizationProfileId): ToolClassification {
  return AUTHORIZATION_PROFILES[profile].autonomousThrough;
}

export function maxConsequenceForProfile(
  profile: Exclude<AuthorizationProfileId, "standard_technician">
): Extract<ToolClassification, "disruptive" | "destructive"> {
  return profile === "authorized_build" ? "destructive" : "disruptive";
}

export function defaultGrantTtlMinutes(profile: Exclude<AuthorizationProfileId, "standard_technician">): number {
  return profile === "authorized_build" ? 12 * 60 : 8 * 60;
}

export function maxGrantTtlMinutes(profile: Exclude<AuthorizationProfileId, "standard_technician">): number {
  return profile === "authorized_build" ? 72 * 60 : 24 * 60;
}
