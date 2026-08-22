import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { SuperOpsClient } from "../superops/client.js";
import { handleTool } from "../tools/handlers.js";
import { AuthorizationRequiredError } from "./errors.js";
import { IdempotencyStore } from "./idempotency.js";
import { classifyScriptConsequence } from "./scripts.js";
import { mintChallengeToken } from "./authorization.js";
import { handleWriteTool } from "./operations.js";
import { PRODUCT_VERSION } from "../version.js";
import { listMcpTools } from "../mcp/server.js";

const stdioEnv = {
  MCP_TRANSPORT: "stdio",
  SUPEROPS_API_TOKEN: "so-secret-token-value-for-tests",
  SUPEROPS_SUBDOMAIN: "demo",
  SUPEROPS_REGION: "us",
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function clientFor(handler: (query: string, variables?: Record<string, unknown>) => unknown): SuperOpsClient {
  return new SuperOpsClient(
    { apiToken: "t", subdomain: "d", region: "us" },
    {
      requestTimeoutMs: 1000,
      maxReadRetries: 1,
      maxRetryDurationMs: 1000,
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { query?: string; variables?: Record<string, unknown> };
        const data = handler(body.query ?? "", body.variables);
        return jsonResponse({ data });
      },
    }
  );
}

describe("Phase 2 write surface", () => {
  it("does not expose a confirmation boolean on write schemas", () => {
    for (const tool of listMcpTools()) {
      const schema = JSON.stringify(tool.inputSchema);
      expect(schema, tool.name).not.toMatch(/confirmed|userApproved|force|includeSecrets/);
    }
  });

  it("reports Phase 2 write state from rpmc_status without executing mutations", async () => {
    const config = loadConfig(stdioEnv);
    const result = await handleTool("rpmc_status", {}, clientFor(() => ({})), config);
    const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
      version: string;
      phase: number;
      writesRegistered: boolean;
      writeToolCount: number;
      readToolCount: number;
      confirmation: { mechanism: string; modelControlledBypass: boolean };
    };
    expect(payload.version).toBe(PRODUCT_VERSION);
    expect(payload.phase).toBe(2);
    expect(payload.writesRegistered).toBe(true);
    expect(payload.writeToolCount).toBeGreaterThan(0);
    expect(payload.readToolCount).toBe(60);
    expect(payload.confirmation.mechanism).toBe("mcp_elicitation");
    expect(payload.confirmation.modelControlledBypass).toBe(false);
  });

  it("creates a ticket and verifies by re-read", async () => {
    const config = loadConfig(stdioEnv);
    const client = clientFor((query) => {
      if (query.includes("query getClient(")) return { getClient: { accountId: "acc1", name: "Acme" } };
      if (query.includes("mutation createTicket")) {
        return { createTicket: { ticketId: "t1", displayId: "220826-0001", subject: "TEST printer", status: "New" } };
      }
      if (query.includes("query getTicket(")) {
        return { getTicket: { ticketId: "t1", displayId: "220826-0001", subject: "TEST printer", status: "New", client: { accountId: "acc1" } } };
      }
      throw new Error(query.slice(0, 80));
    });
    const result = await handleTool(
      "superops_tickets_create",
      { subject: "TEST printer", status: "New", accountId: "acc1", requestId: "req-ticket-1" },
      client,
      config
    );
    const payload = JSON.parse(result.content[0]?.text ?? "{}") as { outcome: string; mutation: string };
    expect(result.isError).toBeFalsy();
    expect(payload.outcome).toBe("complete");
    expect(payload.mutation).toBe("createTicket");
  });

  it("refuses an ambiguous ticket displayId without mutating", async () => {
    let mutated = false;
    const config = loadConfig(stdioEnv);
    const client = clientFor((query) => {
      if (query.includes("getTicketList")) {
        return {
          getTicketList: {
            tickets: [
              { ticketId: "t1", displayId: "220826-0001" },
              { ticketId: "t2", displayId: "220826-0001" },
            ],
            listInfo: { page: 1, pageSize: 5, hasMore: false },
          },
        };
      }
      if (query.includes("mutation")) {
        mutated = true;
        throw new Error("should not mutate");
      }
      throw new Error(query.slice(0, 80));
    });
    const result = await handleTool("superops_tickets_update", { ticket: "220826-0001", status: "Closed" }, client, config);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/Multiple tickets|ambiguous/i);
    expect(mutated).toBe(false);
  });

  it("does not retry a customer-visible create after a successful first call", async () => {
    const config = loadConfig(stdioEnv);
    let creates = 0;
    const client = clientFor((query) => {
      if (query.includes("query getClient(")) return { getClient: { accountId: "acc1", name: "Acme" } };
      if (query.includes("mutation createTicket")) {
        creates += 1;
        return { createTicket: { ticketId: "t1", displayId: "220826-0001", subject: "TEST", status: "New" } };
      }
      if (query.includes("query getTicket(")) {
        return { getTicket: { ticketId: "t1", subject: "TEST", status: "New", client: { accountId: "acc1" } } };
      }
      throw new Error(query.slice(0, 80));
    });
    const args = { subject: "TEST", status: "New", accountId: "acc1", requestId: "req-dup-1" };
    const first = JSON.parse((await handleTool("superops_tickets_create", args, client, config)).content[0]?.text ?? "{}") as {
      idempotentReplay?: boolean;
    };
    const second = JSON.parse((await handleTool("superops_tickets_create", args, client, config)).content[0]?.text ?? "{}") as {
      idempotentReplay?: boolean;
    };
    expect(first.idempotentReplay).toBeFalsy();
    expect(second.idempotentReplay).toBe(true);
    expect(creates).toBe(1);
  });

  it("refuses IT-doc writes to PASSWORD fields", async () => {
    const config = loadConfig(stdioEnv);
    const client = clientFor((query) => {
      if (query.includes("getItDocumentationCategories")) {
        return {
          getItDocumentationCategories: [
            { typeId: "cat1", name: "WiFi", customFields: [{ columnName: "udf1text", label: "Password", fieldType: "PASSWORD" }] },
          ],
        };
      }
      if (query.includes("mutation")) throw new Error("should not mutate");
      throw new Error(query.slice(0, 80));
    });
    const result = await handleTool(
      "superops_itdocs_create",
      { typeId: "cat1", name: "TEST AP", fields: { udf1text: "hunter2" } },
      client,
      config
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/PASSWORD|cannot be written/i);
  });

  it("classifies unknown scripts upward and cannot lower them", () => {
    const unknown = classifyScriptConsequence({ scriptId: "s1", name: "Custom helper" });
    expect(unknown.classification).toBe("disruptive");
    expect(unknown.unknown).toBe(true);
    const diagnostic = classifyScriptConsequence({ scriptId: "s2", name: "Collect inventory", description: "inventory gather" });
    expect(diagnostic.classification).toBe("write_low");
    const raised = classifyScriptConsequence(
      { scriptId: "s2", name: "Collect inventory", description: "inventory gather" },
      { raiseEnv: "s2:destructive" }
    );
    expect(raised.classification).toBe("destructive");
    const ignoredLower = classifyScriptConsequence(
      { scriptId: "s3", name: "Reboot workstation" },
      { raiseEnv: "s3:write_low" }
    );
    expect(ignoredLower.classification).toBe("disruptive");
  });

  it("cannot execute resolveAlerts without human confirmation", async () => {
    const config = loadConfig(stdioEnv);
    let mutated = false;
    const client = clientFor((query) => {
      if (query.includes("mutation")) {
        mutated = true;
        return { resolveAlerts: true };
      }
      return {};
    });
    await expect(handleTool("superops_alerts_resolve", { alertIds: ["a1"] }, client, config)).rejects.toBeInstanceOf(
      AuthorizationRequiredError
    );
    expect(mutated).toBe(false);
  });

  it("rejects a model-controlled confirmation boolean and still requires elicitation", async () => {
    const config = loadConfig(stdioEnv);
    await expect(
      handleTool("superops_alerts_resolve", { alertIds: ["a1"], confirmed: true, userApproved: true }, clientFor(() => ({})), config)
    ).rejects.toBeInstanceOf(AuthorizationRequiredError);
  });

  it("executes resolveAlerts only after a scoped elicitation accept", async () => {
    const config = loadConfig(stdioEnv);
    const store = new IdempotencyStore();
    const client = clientFor((query) => {
      if (query.includes("mutation resolveAlerts")) return { resolveAlerts: true };
      if (query.includes("getAlertsForAsset")) {
        return { getAlertsForAsset: { alerts: [{ id: "a1", status: "Resolved" }], listInfo: { page: 1, hasMore: false } } };
      }
      return {};
    });
    const token = mintChallengeToken(
      {
        v: 1,
        action: "resolveAlerts",
        targetType: "alert",
        targetId: "a1",
        consequence: "disruptive",
        paramDigest: expect.getState().currentTestName ? undefined as never : "",
        exp: Date.now() + 60_000,
        nonce: "abc",
      },
      config
    );
    // First compute the real digest by catching the challenge, then accept it.
    try {
      await handleWriteTool(
        "superops_alerts_resolve",
        { alertIds: ["a1"], assetId: "asset1", requestId: "req-alert-1" },
        { client, config, store }
      );
      throw new Error("expected authorization");
    } catch (error) {
      if (!(error instanceof AuthorizationRequiredError)) throw error;
      const accepted = await handleWriteTool(
        "superops_alerts_resolve",
        { alertIds: ["a1"], assetId: "asset1", requestId: "req-alert-1" },
        {
          client,
          config,
          store,
          ctx: {
            requestState: error.elicit.requestState,
            inputResponses: { confirm: { action: "accept", content: { confirm: true, typedTarget: "a1" } } },
          },
        }
      );
      expect(accepted.outcome).toBe("complete");
      expect(token).toBeTruthy();
    }
  });

  it("does not leak ticket bodies or secrets in write audit metadata", async () => {
    const config = loadConfig(stdioEnv);
    const client = clientFor((query) => {
      if (query.includes("query getTicket(")) {
        return { getTicket: { ticketId: "t1", displayId: "220826-0001", subject: "password: hunter2", status: "Open" } };
      }
      if (query.includes("mutation updateTicket")) {
        return { updateTicket: { ticketId: "t1", status: "Closed" } };
      }
      throw new Error(query.slice(0, 80));
    });
    const result = await handleTool("superops_tickets_update", { ticket: "t1", status: "Closed" }, client, config);
    expect(JSON.stringify(result.audit)).not.toContain("hunter2");
    expect(JSON.stringify(result.audit)).not.toContain("password");
    expect(result.audit?.metadata?.targetType).toBe("ticket");
  });
});
