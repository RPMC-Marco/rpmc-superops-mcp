import { describe, expect, it, vi } from "vitest";
import { SuperOpsClient } from "./client.js";
import { SuperOpsHttpError, SuperOpsRateLimitError, SuperOpsTimeoutError } from "./errors.js";
import { MinuteLimiter } from "./limiter.js";
import { GET_CLIENT_LIST } from "./queries.js";

function jsonResponse(body: unknown, init?: { status?: number; headers?: Record<string, string> }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

describe("SuperOpsClient", () => {
  const creds = { apiToken: "tok", subdomain: "demo", region: "us" as const };
  const options = {
    requestTimeoutMs: 50,
    maxReadRetries: 3,
    maxRetryDurationMs: 1_000,
  };

  it("sends CustomerSubDomain and Bearer headers", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: { ok: true } }));
    const client = new SuperOpsClient(creds, { ...options, fetchImpl: fetchImpl as unknown as typeof fetch });
    await client.query(GET_CLIENT_LIST, { input: { page: 1, pageSize: 1 } });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.CustomerSubDomain).toBe("demo");
    expect(headers.Authorization).toBe("Bearer tok");
    expect(String(init.body)).toContain("pageSize");
  });

  it("retries HTTP 429 reads", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "slow down" }, { status: 429, headers: { "Retry-After": "0" } }))
      .mockResolvedValueOnce(jsonResponse({ data: { ok: true } }));
    const client = new SuperOpsClient(creds, { ...options, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.query("query Q { ping }")).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry mutations because mutations are disabled", async () => {
    const fetchImpl = vi.fn();
    const client = new SuperOpsClient(creds, { ...options, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.query("mutation M { ping }")).rejects.toThrow(/Mutations are disabled/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("times out using AbortController", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      await new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
      return jsonResponse({ data: {} });
    });
    const client = new SuperOpsClient(creds, {
      ...options,
      requestTimeoutMs: 20,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.query("query Q { ping }")).rejects.toBeInstanceOf(SuperOpsTimeoutError);
  });

  it("enforces the local 100/min limiter", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: { ok: true } }));
    const limiter = new MinuteLimiter(1, () => 0);
    const client = new SuperOpsClient(creds, {
      ...options,
      limiter,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.query("query Q { ping }");
    await expect(client.query("query Q { ping }")).rejects.toBeInstanceOf(SuperOpsRateLimitError);
  });

  it("surfaces HTTP errors", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, { status: 400 }));
    const client = new SuperOpsClient(creds, {
      ...options,
      maxReadRetries: 1,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.query("query Q { ping }")).rejects.toBeInstanceOf(SuperOpsHttpError);
  });

  it("preserves unquoted SuperOps IDs above Number.MAX_SAFE_INTEGER at the parse boundary", async () => {
    const accountId = "6623952408805568512";
    const assetId = "81307563136999424";
    expect(String(JSON.parse(accountId))).not.toBe(accountId);
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          `{"data":{"getClientSite":{"id":"${assetId}","client":{"accountId":${accountId},"name":"Acme"},"listInfo":{"page":1,"pageSize":25,"totalCount":3},"cpu":{"cpuUsage":{"value":2}}}}}`,
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
    );
    const client = new SuperOpsClient(creds, { ...options, fetchImpl: fetchImpl as unknown as typeof fetch });
    const data = (await client.query("query Q { ping }")) as {
      getClientSite: {
        id: string;
        client: { accountId: string };
        listInfo: { page: number; totalCount: number };
        cpu: { cpuUsage: { value: number } };
      };
    };
    expect(data.getClientSite.client.accountId).toBe(accountId);
    expect(data.getClientSite.id).toBe(assetId);
    expect(data.getClientSite.listInfo.page).toBe(1);
    expect(data.getClientSite.listInfo.totalCount).toBe(3);
    expect(data.getClientSite.cpu.cpuUsage.value).toBe(2);
  });
});
