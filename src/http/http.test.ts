import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleMcpHttpRequest } from "./mcp-http.js";
import { withClosableResources } from "./lifecycle.js";
import { evaluateOrigin } from "./origin.js";
import type { AppConfig } from "../config.js";
import type { SuperOpsClient } from "../superops/client.js";

const TOKEN = "a".repeat(32);

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    transport: "http",
    httpHost: "127.0.0.1",
    httpPort: 8080,
    mcpAuthToken: TOKEN,
    allowedOriginHostnames: [],
    superopsApiToken: "so",
    superopsSubdomain: "demo",
    superopsRegion: "us",
    requestTimeoutMs: 1000,
    maxReadRetries: 1,
    maxRetryDurationMs: 1000,
    logLevel: "info",
    ...overrides,
  };
}

function fakeReq(headers: Record<string, string | string[] | undefined>): IncomingMessage {
  return { headers } as IncomingMessage;
}

function fakeRes() {
  const state = { status: 0, body: "", headersSent: false };
  const res = {
    get headersSent() {
      return state.headersSent;
    },
    writeHead(status: number) {
      state.status = status;
      state.headersSent = true;
      return res;
    },
    end(body?: string) {
      state.body = body ?? "";
      state.headersSent = true;
      return res;
    },
  };
  return { res: res as unknown as ServerResponse, state };
}

describe("origin policy", () => {
  it("allows requests with no Origin header", () => {
    expect(evaluateOrigin(undefined, []).allowed).toBe(true);
    expect(evaluateOrigin("", []).allowed).toBe(true);
  });

  it("allows loopback Origin by default", () => {
    expect(evaluateOrigin("http://127.0.0.1:8080", []).allowed).toBe(true);
    expect(evaluateOrigin("http://localhost:3000", []).allowed).toBe(true);
  });

  it("rejects non-allowlisted Origin", () => {
    expect(evaluateOrigin("https://evil.example", []).allowed).toBe(false);
    expect(evaluateOrigin("https://evil.example", ["mcp.example"]).allowed).toBe(false);
  });

  it("allows configured Origin hostnames for future tunnel hosts", () => {
    expect(evaluateOrigin("https://mcp.example", ["mcp.example"]).allowed).toBe(true);
  });

  it("rejects null and unparseable Origins", () => {
    expect(evaluateOrigin("null", []).allowed).toBe(false);
    expect(evaluateOrigin("not-a-url", []).allowed).toBe(false);
    expect(evaluateOrigin(["http://localhost", "http://evil"], []).allowed).toBe(false);
  });
});

describe("HTTP request lifecycle", () => {
  it("closes server and transport if handleRequest throws", async () => {
    const serverClose = vi.fn(async () => undefined);
    const transportClose = vi.fn(async () => undefined);
    const { res, state } = fakeRes();
    await handleMcpHttpRequest(fakeReq({ authorization: `Bearer ${TOKEN}` }), res, config(), {} as SuperOpsClient, {
      createServer: () => ({
        connect: async () => undefined,
        close: serverClose,
      }),
      createTransport: () => ({
        handleRequest: async () => {
          throw new Error("internal boom token=super-secret");
        },
        close: transportClose,
      }),
    });
    expect(serverClose).toHaveBeenCalledTimes(1);
    expect(transportClose).toHaveBeenCalledTimes(1);
    expect(state.status).toBe(400);
    expect(state.body).toBe(JSON.stringify({ error: "request failed" }));
    expect(state.body).not.toContain("super-secret");
    expect(state.body).not.toContain("boom");
  });

  it("rejects invalid Origin before creating a transport", async () => {
    const createTransport = vi.fn();
    const { res, state } = fakeRes();
    await handleMcpHttpRequest(
      fakeReq({ authorization: `Bearer ${TOKEN}`, origin: "https://evil.example" }),
      res,
      config(),
      {} as SuperOpsClient,
      { createTransport }
    );
    expect(createTransport).not.toHaveBeenCalled();
    expect(state.status).toBe(403);
  });

  it("rejects missing Bearer auth", async () => {
    const { res, state } = fakeRes();
    await handleMcpHttpRequest(fakeReq({}), res, config(), {} as SuperOpsClient, {
      createTransport: () => {
        throw new Error("should not create transport");
      },
    });
    expect(state.status).toBe(401);
  });

  it("closes resources in finally even when work succeeds", async () => {
    const closeA = vi.fn(async () => undefined);
    const closeB = vi.fn(async () => undefined);
    await withClosableResources([{ close: closeA }, { close: closeB }], async () => undefined);
    expect(closeA).toHaveBeenCalled();
    expect(closeB).toHaveBeenCalled();
  });
});
