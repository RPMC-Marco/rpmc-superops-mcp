import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";
import { listMcpTools } from "./mcp/server.js";
import { SuperOpsClient } from "./superops/client.js";
import { registeredToolNames, unregisteredWriteNames } from "./capabilities.js";
import { handleTool } from "./tools/handlers.js";

const env = {
  MCP_TRANSPORT: "stdio",
  MCP_AUTH_TOKEN: "mcp-secret",
  SUPEROPS_API_TOKEN: "so-secret",
  SUPEROPS_SUBDOMAIN: "demo",
  SUPEROPS_REGION: "us",
};

describe("config", () => {
  it("fails closed without MCP_AUTH_TOKEN", () => {
    expect(() => loadConfig({ ...env, MCP_AUTH_TOKEN: "" })).toThrow(/MCP_AUTH_TOKEN/);
  });

  it("rejects unknown SuperOps regions", () => {
    expect(() => loadConfig({ ...env, SUPEROPS_REGION: "ap" })).toThrow(/SUPEROPS_REGION/);
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
});

describe("handlers", () => {
  it("does not execute unknown write tools", async () => {
    const config = loadConfig(env);
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
});
