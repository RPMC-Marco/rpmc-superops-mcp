import { createHash } from "node:crypto";
import type { WriteExecutionResult } from "./types.js";

const DEFAULT_TTL_MS = 15 * 60 * 1000;

export type IdempotencyStatus = "complete" | "partial" | "failed" | "in_flight" | "uncertain";

interface CacheRecord {
  fingerprint: string;
  requestId?: string;
  storedAt: number;
  expiresAt: number;
  status: IdempotencyStatus;
  result?: WriteExecutionResult;
}

export class IdempotencyStore {
  private readonly byFingerprint = new Map<string, CacheRecord>();
  private readonly byRequestId = new Map<string, string>();

  constructor(
    private readonly ttlMs = DEFAULT_TTL_MS,
    private readonly now: () => number = () => Date.now()
  ) {}

  fingerprint(toolName: string, targetId: string, canonicalPayload: unknown): string {
    const digest = createHash("sha256")
      .update(JSON.stringify({ toolName, targetId, canonicalPayload }))
      .digest("hex");
    return digest;
  }

  begin(fingerprint: string, requestId?: string): { ok: true } | { ok: false; reason: "duplicate" | "uncertain" | "in_flight"; cached?: WriteExecutionResult } {
    this.sweep();
    const existing = this.byFingerprint.get(fingerprint) ?? (requestId ? this.lookupRequestId(requestId) : undefined);
    if (existing) {
      if (existing.status === "in_flight") return { ok: false, reason: "in_flight" };
      if (existing.status === "uncertain") return { ok: false, reason: "uncertain" };
      if (existing.result) return { ok: false, reason: "duplicate", cached: existing.result };
    }
    const record: CacheRecord = {
      fingerprint,
      requestId,
      storedAt: this.now(),
      expiresAt: this.now() + this.ttlMs,
      status: "in_flight",
    };
    this.byFingerprint.set(fingerprint, record);
    if (requestId) this.byRequestId.set(requestId, fingerprint);
    return { ok: true };
  }

  complete(fingerprint: string, result: WriteExecutionResult): void {
    const existing = this.byFingerprint.get(fingerprint);
    if (!existing) return;
    existing.status = result.outcome;
    existing.result = result;
    existing.expiresAt = this.now() + this.ttlMs;
  }

  markUncertain(fingerprint: string): void {
    const existing = this.byFingerprint.get(fingerprint);
    if (!existing) return;
    existing.status = "uncertain";
    existing.result = undefined;
    existing.expiresAt = this.now() + this.ttlMs;
  }

  abort(fingerprint: string): void {
    const existing = this.byFingerprint.get(fingerprint);
    if (!existing || existing.status !== "in_flight") return;
    this.byFingerprint.delete(fingerprint);
    if (existing.requestId) this.byRequestId.delete(existing.requestId);
  }

  private lookupRequestId(requestId: string): CacheRecord | undefined {
    const fingerprint = this.byRequestId.get(requestId);
    return fingerprint ? this.byFingerprint.get(fingerprint) : undefined;
  }

  private sweep(): void {
    const now = this.now();
    for (const [key, record] of this.byFingerprint) {
      if (record.expiresAt <= now) {
        this.byFingerprint.delete(key);
        if (record.requestId) this.byRequestId.delete(record.requestId);
      }
    }
  }
}

export const defaultIdempotencyStore = new IdempotencyStore();
