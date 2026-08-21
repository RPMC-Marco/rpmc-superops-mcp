import { describe, expect, it } from "vitest";
import { HTTP_AUTH_TOKEN_MIN_LENGTH, loadConfig } from "./config.js";
import { listMcpTools } from "./mcp/server.js";
import { SuperOpsClient } from "./superops/client.js";
import { registeredToolNames, unregisteredWriteNames } from "./capabilities.js";
import { handleTool } from "./tools/handlers.js";

const stdioEnv = {
  MCP_TRANSPORT: "stdio",
  SUPEROPS_API_TOKEN: "so-secret",
  SUPEROPS_SUBDOMAIN: "demo",
  SUPEROPS_REGION: "us",
};

const httpEnv = {
  ...stdioEnv,
  MCP_TRANSPORT: "http",
  MCP_AUTH_TOKEN: "x".repeat(HTTP_AUTH_TOKEN_MIN_LENGTH),
};

describe("config", () => {
  it("allows stdio without MCP_AUTH_TOKEN", () => {
    const config = loadConfig(stdioEnv);
    expect(config.transport).toBe("stdio");
    expect(config.mcpAuthToken).toBeUndefined();
  });

  it("requires a strong MCP_AUTH_TOKEN for HTTP", () => {
    expect(() => loadConfig({ ...httpEnv, MCP_AUTH_TOKEN: "" })).toThrow(/MCP_AUTH_TOKEN/);
    expect(() => loadConfig({ ...httpEnv, MCP_AUTH_TOKEN: "short" })).toThrow(/at least 32/);
  });

  it("rejects unknown SuperOps regions", () => {
    expect(() => loadConfig({ ...stdioEnv, SUPEROPS_REGION: "ap" })).toThrow(/SUPEROPS_REGION/);
  });

  it("parses allowed Origin hostnames for future tunnel deployment", () => {
    const config = loadConfig({ ...httpEnv, MCP_ALLOWED_ORIGINS: "https://mcp.example,192.168.1.10" });
    expect(config.allowedOriginHostnames).toEqual(["mcp.example", "192.168.1.10"]);
    expect(config.allowedHostHostnames).toEqual(["mcp.example", "192.168.1.10"]);
  });

  it("parses MCP_ALLOWED_HOSTS independently when set", () => {
    const config = loadConfig({
      ...httpEnv,
      MCP_ALLOWED_ORIGINS: "https://mcp.example",
      MCP_ALLOWED_HOSTS: "nas.lan",
    });
    expect(config.allowedOriginHostnames).toEqual(["mcp.example"]);
    expect(config.allowedHostHostnames).toEqual(["nas.lan"]);
  });
});

describe("mcp server tools/list", () => {
  it("lists only registered read tools", () => {
    const names = listMcpTools().map((tool) => tool.name);
    expect(names.sort()).toEqual([...registeredToolNames()].sort());
    for (const writeName of unregisteredWriteNames()) {
      expect(names).not.toContain(writeName);
    }
  });

  it("does not expose an unvalidated ticket status filter", () => {
    const ticketsList = listMcpTools().find((tool) => tool.name === "superops_tickets_list");
    expect(JSON.stringify(ticketsList?.inputSchema)).not.toMatch(/status/);
  });
});

describe("handlers", () => {
  it("does not execute unknown write tools", async () => {
    const config = loadConfig(stdioEnv);
    const client = new SuperOpsClient(
      { apiToken: "t", subdomain: "d", region: "us" },
      {
        requestTimeoutMs: 1000,
        maxReadRetries: 1,
        maxRetryDurationMs: 1000,
        fetchImpl: async () => {
          throw new Error("should not call SuperOps");
        },
      }
    );
    const result = await handleTool("superops_tickets_create", {}, client, config);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/not registered|Unknown/i);
  });

  it("does not send a ticket status condition even if a caller supplies one", async () => {
    let body = "";
    const config = loadConfig(stdioEnv);
    const client = new SuperOpsClient(
      { apiToken: "t", subdomain: "d", region: "us" },
      {
        requestTimeoutMs: 1000,
        maxReadRetries: 1,
        maxRetryDurationMs: 1000,
        fetchImpl: async (_url, init) => {
          body = String(init?.body ?? "");
          return new Response(JSON.stringify({ data: { getTicketList: { tickets: [] } } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        },
      }
    );
    await handleTool("superops_tickets_list", { status: "Open" }, client, config);
    expect(body).not.toMatch(/"condition"/);
    expect(body).not.toMatch(/"status":"Open"/);
  });
});
