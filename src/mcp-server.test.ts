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

  it("does not expose raw RuleConditionInput or arbitrary GraphQL", () => {
    for (const tool of listMcpTools()) {
      const schema = JSON.stringify(tool.inputSchema);
      expect(schema, tool.name).not.toMatch(/RuleConditionInput/);
      expect(schema, tool.name).not.toMatch(/mutation/);
    }
  });

  it("registers investigate_ticket with ticket and optional assetId only", () => {
    const tool = listMcpTools().find((item) => item.name === "investigate_ticket");
    expect(tool).toBeDefined();
    const schema = JSON.stringify(tool?.inputSchema);
    expect(schema).toMatch(/ticket/);
    expect(schema).toMatch(/assetId/);
    expect(schema).not.toMatch(/status/);
    expect(schema).not.toMatch(/createdTime/);
  });

  it("registers investigate_asset with explicit identity fields only", () => {
    const tool = listMcpTools().find((item) => item.name === "investigate_asset");
    expect(tool).toBeDefined();
    const schema = JSON.stringify(tool?.inputSchema);
    expect(schema).toMatch(/assetId/);
    expect(schema).toMatch(/hostName/);
    expect(schema).toMatch(/serialNumber/);
    expect(schema).not.toMatch(/createdTime/);
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

  it("lets investigate_ticket send a displayId condition without paging the tenant", async () => {
    const bodies: string[] = [];
    const config = loadConfig(stdioEnv);
    const client = new SuperOpsClient(
      { apiToken: "t", subdomain: "d", region: "us" },
      {
        requestTimeoutMs: 1000,
        maxReadRetries: 1,
        maxRetryDurationMs: 1000,
        fetchImpl: async (_url, init) => {
          const body = String(init?.body ?? "");
          bodies.push(body);
          if (body.includes("getTicketList")) {
            return new Response(
              JSON.stringify({
                data: {
                  getTicketList: {
                    tickets: [{ ticketId: "t1", displayId: "200826-0001" }],
                    listInfo: { page: 1, pageSize: 5, hasMore: false, totalCount: 1 },
                  },
                },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          if (body.includes("query getTicket(")) {
            return new Response(
              JSON.stringify({ data: { getTicket: { ticketId: "t1", displayId: "200826-0001" } } }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          if (body.includes("getTicketConversationList")) {
            return new Response(JSON.stringify({ data: { getTicketConversationList: [] } }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          if (body.includes("getTicketNoteList")) {
            return new Response(JSON.stringify({ data: { getTicketNoteList: [] } }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          throw new Error(body.slice(0, 80));
        },
      }
    );
    const result = await handleTool("investigate_ticket", { ticket: "200826-0001" }, client, config);
    const payload = JSON.parse(result.content[0]?.text ?? "{}") as { status: string };
    expect(result.isError).toBeFalsy();
    expect(payload.status).toBe("complete");
    expect(bodies.some((item) => item.includes('"operator":"is"') && item.includes("displayId"))).toBe(true);
    expect(bodies.filter((item) => item.includes("getTicketList"))).toHaveLength(1);
    expect(bodies.some((item) => item.includes('"attribute":"createdTime"'))).toBe(false);
    expect(bodies.some((item) => /"page":\s*2/.test(item))).toBe(false);
  });

  it("flattens superops_tickets_get to ticket fields", async () => {
    const config = loadConfig(stdioEnv);
    const client = new SuperOpsClient(
      { apiToken: "t", subdomain: "d", region: "us" },
      {
        requestTimeoutMs: 1000,
        maxReadRetries: 1,
        maxRetryDurationMs: 1000,
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              data: {
                getTicket: { ticketId: "t1", displayId: "200826-0001", subject: "Printer jam" },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          ),
      }
    );
    const result = await handleTool("superops_tickets_get", { ticketId: "t1" }, client, config);
    const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
      ticket: { ticketId: string; displayId: string; subject: string; getTicket?: unknown };
      notes: { descriptionField: string };
    };
    expect(result.isError).toBeFalsy();
    expect(payload.ticket.ticketId).toBe("t1");
    expect(payload.ticket.displayId).toBe("200826-0001");
    expect(payload.ticket.subject).toBe("Printer jam");
    expect(payload.ticket.getTicket).toBeUndefined();
    expect(payload.notes.descriptionField).toMatch(/DESCRIPTION/);
  });

  it("redacts secrets in flattened ticket output", async () => {
    const config = loadConfig(stdioEnv);
    const client = new SuperOpsClient(
      { apiToken: "t", subdomain: "d", region: "us" },
      {
        requestTimeoutMs: 1000,
        maxReadRetries: 1,
        maxRetryDurationMs: 1000,
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              data: { getTicket: { ticketId: "t1", subject: "password: hunter2" } },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          ),
      }
    );
    const result = await handleTool("superops_tickets_get", { ticketId: "t1" }, client, config);
    expect(result.content[0]?.text).not.toContain("hunter2");
    expect(result.content[0]?.text).toContain("[redacted]");
  });

  it("normalizes list hasMore true and null through tool output", async () => {
    const config = loadConfig(stdioEnv);
    const responses = [
      {
        getTicketList: {
          tickets: [{ ticketId: "1" }],
          listInfo: { page: 1, pageSize: 25, hasMore: true, totalCount: 26 },
        },
      },
      {
        getTicketList: {
          tickets: [{ ticketId: "2" }],
          listInfo: { page: 2, pageSize: 25, hasMore: null, totalCount: 26 },
        },
      },
    ];
    let call = 0;
    const client = new SuperOpsClient(
      { apiToken: "t", subdomain: "d", region: "us" },
      {
        requestTimeoutMs: 1000,
        maxReadRetries: 1,
        maxRetryDurationMs: 1000,
        fetchImpl: async () => {
          const data = responses[call] ?? responses[1];
          call += 1;
          return new Response(JSON.stringify({ data }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        },
      }
    );
    const first = JSON.parse(
      (await handleTool("superops_tickets_list", { page: 1 }, client, config)).content[0]?.text ?? "{}"
    ) as { getTicketList: { listInfo: { hasMore: boolean } } };
    const last = JSON.parse(
      (await handleTool("superops_tickets_list", { page: 2 }, client, config)).content[0]?.text ?? "{}"
    ) as { getTicketList: { listInfo: { hasMore: boolean } } };
    expect(first.getTicketList.listInfo.hasMore).toBe(true);
    expect(last.getTicketList.listInfo.hasMore).toBe(false);
  });

  it("attaches privacy-safe investigation audit on investigate_ticket without marking isError", async () => {
    const config = loadConfig(stdioEnv);
    const client = new SuperOpsClient(
      { apiToken: "t", subdomain: "d", region: "us" },
      {
        requestTimeoutMs: 1000,
        maxReadRetries: 1,
        maxRetryDurationMs: 1000,
        fetchImpl: async (_url, init) => {
          const body = String(init?.body ?? "");
          if (body.includes("getTicketList")) {
            return new Response(
              JSON.stringify({
                data: { getTicketList: { tickets: [], listInfo: { page: 1, pageSize: 5, hasMore: false, totalCount: 0 } } },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          throw new Error(body.slice(0, 80));
        },
      }
    );
    const result = await handleTool("investigate_ticket", { ticket: "200826-0001" }, client, config);
    expect(result.isError).toBeFalsy();
    expect(result.audit?.outcome).toBe("failed");
    expect(result.audit?.errorCode).toBe("not_found");
    expect(JSON.stringify(result.audit)).not.toMatch(/@/);
  });

  it("sends getAlertsForAsset for investigate_asset and leaves primitive alert list unchanged", async () => {
    const bodies: string[] = [];
    const config = loadConfig(stdioEnv);
    const assetId = "9001114136934215681";
    const client = new SuperOpsClient(
      { apiToken: "t", subdomain: "d", region: "us" },
      {
        requestTimeoutMs: 1000,
        maxReadRetries: 1,
        maxRetryDurationMs: 1000,
        fetchImpl: async (_url, init) => {
          const body = String(init?.body ?? "");
          bodies.push(body);
          if (body.includes("query getAsset(")) {
            return new Response(JSON.stringify({ data: { getAsset: { assetId, name: "PC" } } }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          if (body.includes("getAssetSummary")) {
            return new Response(JSON.stringify({ data: { getAssetSummary: { cpu: { cpuName: "x" } } } }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          if (body.includes("getAssetActivity")) {
            return new Response(
              JSON.stringify({
                data: { getAssetActivity: { activities: [], listInfo: { page: 1, pageSize: 15, hasMore: false, totalCount: 0 } } },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          if (body.includes("getAssetSoftwareList")) {
            return new Response(
              JSON.stringify({
                data: { getAssetSoftwareList: { assetSoftwares: [], listInfo: { page: 1, pageSize: 25, hasMore: false, totalCount: 0 } } },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          if (body.includes("getAssetPatchDetails")) {
            return new Response(
              JSON.stringify({
                data: { getAssetPatchDetails: { assetPatches: [], listInfo: { page: 1, pageSize: 100, hasMore: false, totalCount: 0 } } },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          if (body.includes("getAlertsForAsset")) {
            return new Response(
              JSON.stringify({
                data: { getAlertsForAsset: { alerts: [], listInfo: { page: 1, pageSize: 25, hasMore: false, totalCount: 0 } } },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          if (body.includes("getAlertList")) {
            return new Response(
              JSON.stringify({
                data: { getAlertList: { alerts: [], listInfo: { page: 1, pageSize: 25, hasMore: false, totalCount: 0 } } },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          throw new Error(body.slice(0, 80));
        },
      }
    );
    const investigated = await handleTool("investigate_asset", { assetId }, client, config);
    expect(investigated.isError).toBeFalsy();
    expect(investigated.audit?.outcome).toBe("complete");
    expect(bodies.some((item) => item.includes("getAlertsForAsset"))).toBe(true);
    expect(bodies.some((item) => item.includes("getAlertList"))).toBe(false);
    bodies.length = 0;
    await handleTool("superops_alerts_list", { page: 1 }, client, config);
    expect(bodies.some((item) => item.includes("getAlertList"))).toBe(true);
    expect(bodies.some((item) => item.includes("getAlertsForAsset"))).toBe(false);
  });

  it("omits structured owner.email from primitive superops_alerts_list", async () => {
    const config = loadConfig(stdioEnv);
    const client = new SuperOpsClient(
      { apiToken: "t", subdomain: "d", region: "us" },
      {
        requestTimeoutMs: 1000,
        maxReadRetries: 1,
        maxRetryDurationMs: 1000,
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              data: {
                getAlertList: {
                  alerts: [
                    {
                      id: "a1",
                      message: "Disk low; contact ops@client.com",
                      asset: { assetId: "81307563136999424", owner: { name: "Jane", email: "jane@client.com" } },
                    },
                  ],
                  listInfo: { page: 1, pageSize: 25, hasMore: false, totalCount: 1 },
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          ),
      }
    );
    const result = await handleTool("superops_alerts_list", { page: 1 }, client, config);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("ops@client.com");
    expect(text).toContain("81307563136999424");
    expect(text).not.toContain("jane@client.com");
  });
});
