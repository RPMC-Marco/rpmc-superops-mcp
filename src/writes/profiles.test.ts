import { describe, expect, it, beforeEach } from "vitest";
import { loadConfig } from "../config.js";
import { SuperOpsClient } from "../superops/client.js";
import { handleTool } from "../tools/handlers.js";
import { AuthorizationRequiredError } from "./errors.js";
import {
  defaultGrantRegistry,
  mintAuthorizationGrant,
  type GrantClaims,
} from "./grants.js";
import { HMAC_PURPOSE_GRANT, verifyHmacToken } from "./hmac.js";

const stdioEnv = {
  MCP_TRANSPORT: "stdio",
  SUPEROPS_API_TOKEN: "so-secret-token-value-for-tests",
  SUPEROPS_SUBDOMAIN: "demo",
  SUPEROPS_REGION: "us",
};

const config = loadConfig(stdioEnv);

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

function scriptClient(scriptName: string, assetId = "asset-1"): SuperOpsClient {
  return clientFor((query) => {
    if (query.includes("getScriptList")) {
      return {
        getScriptList: {
          scripts: [{ scriptId: "s-reboot", name: scriptName, description: scriptName }],
          listInfo: { page: 1, pageSize: 5, hasMore: false },
        },
      };
    }
    if (query.includes("query getAsset(")) {
      return { getAsset: { assetId, hostName: "NEW-SRV01", client: { accountId: "acc1" } } };
    }
    if (query.includes("mutation runScriptOnAsset")) {
      return { runScriptOnAsset: { actionConfigId: "ac1" } };
    }
    throw new Error(query.slice(0, 80));
  });
}

function namedScriptClient(scriptId: string, scriptName: string, assetId: string): SuperOpsClient {
  return clientFor((query) => {
    if (query.includes("getScriptList")) {
      return {
        getScriptList: {
          scripts: [{ scriptId, name: scriptName, description: scriptName }],
          listInfo: { page: 1, pageSize: 5, hasMore: false },
        },
      };
    }
    if (query.includes("query getAsset(")) {
      return { getAsset: { assetId, hostName: assetId, client: { accountId: "acc1" } } };
    }
    if (query.includes("mutation runScriptOnAsset")) {
      return { runScriptOnAsset: { actionConfigId: "ac1" } };
    }
    throw new Error(query.slice(0, 80));
  });
}

function ticketClient(): SuperOpsClient {
  return clientFor((query) => {
    if (query.includes("query getTicket(")) {
      return {
        getTicket: {
          ticketId: "t1",
          displayId: "220826-0001",
          status: "Open",
          subject: "TEST",
          client: { accountId: "acc1" },
        },
      };
    }
    if (query.includes("mutation updateTicket")) return { updateTicket: { ticketId: "t1", status: "Resolved" } };
    if (query.includes("mutation createTicketNote")) return { createTicketNote: { noteId: "n1" } };
    if (query.includes("getTicketNoteList")) return { getTicketNoteList: [{ noteId: "n1" }] };
    throw new Error(query.slice(0, 80));
  });
}

async function issueGrant(args: Record<string, unknown>, ack: "B" | "C"): Promise<{ grantToken: string; claims: { profile: string } }> {
  try {
    await handleTool("rpmc_authorization_request_grant", args, clientFor(() => ({})), config);
    throw new Error("expected grant elicitation");
  } catch (error) {
    if (!(error instanceof AuthorizationRequiredError)) throw error;
    const targets = Array.isArray(args.targets) ? (args.targets as Array<{ id?: string; label?: string }>) : [];
    const typedScope = String(targets[0]?.id ?? targets[0]?.label ?? args.ticket ?? "");
    const accepted = await handleTool("rpmc_authorization_request_grant", args, clientFor(() => ({})), config, {
      requestState: error.elicit.requestState,
      inputResponses: {
        confirm: { action: "accept", content: { confirm: true, typedScope, acknowledgedProfile: ack } },
      },
    });
    expect(accepted.isError).toBeFalsy();
    return JSON.parse(accepted.content[0]?.text ?? "{}") as { grantToken: string; claims: { profile: string } };
  }
}

describe("authorization profiles and grants", () => {
  beforeEach(() => {
    defaultGrantRegistry.clear();
  });

  it("requires human confirmation for Rules A disruptive and destructive actions", async () => {
    await expect(
      handleTool("superops_scripts_execute", { scriptId: "s-reboot", assetId: "asset-1" }, scriptClient("Reboot server"), config)
    ).rejects.toBeInstanceOf(AuthorizationRequiredError);
    await expect(
      handleTool(
        "superops_scripts_execute",
        { scriptId: "s-reboot", assetId: "asset-1" },
        scriptClient("Delete user profile"),
        config
      )
    ).rejects.toBeInstanceOf(AuthorizationRequiredError);
  });

  it("cannot self-select Rules B/C with a profile argument", async () => {
    await expect(
      handleTool(
        "superops_scripts_execute",
        { scriptId: "s-reboot", assetId: "asset-1", profile: "C", authorizationProfile: "authorized_build" },
        scriptClient("Reboot server"),
        config
      )
    ).rejects.toBeInstanceOf(AuthorizationRequiredError);
  });

  it("always elicits for grant creation and cannot skip it", async () => {
    await expect(
      handleTool(
        "rpmc_authorization_request_grant",
        {
          profile: "C",
          task: "Build NEW-SRV01",
          targets: [{ type: "asset", id: "asset-1", label: "NEW-SRV01" }],
          confirmed: true,
        },
        clientFor(() => ({})),
        config
      )
    ).rejects.toBeInstanceOf(AuthorizationRequiredError);
  });

  it("preauthorizes scoped disruptive actions under Rules B after one human grant, but still asks for destructive", async () => {
    const grant = await issueGrant(
      {
        profile: "maintenance_window",
        task: "Handle ticket 1234 under Rules B",
        targets: [{ type: "asset", id: "asset-1", label: "NEW-SRV01" }],
      },
      "B"
    );
    expect(grant.claims.profile).toBe("maintenance_window");

    const first = await handleTool(
      "superops_scripts_execute",
      { scriptId: "s-reboot", assetId: "asset-1", authorizationGrant: grant.grantToken, requestId: "req-b-01" },
      namedScriptClient("s-reboot", "Reboot server", "asset-1"),
      config
    );
    const firstPayload = JSON.parse(first.content[0]?.text ?? "{}") as {
      classification: string;
      authorization: { result: string; profile: string };
    };
    expect(first.isError).toBeFalsy();
    expect(firstPayload.classification).toBe("disruptive");
    expect(firstPayload.authorization.result).toBe("preauthorized_by_scoped_grant");
    expect(firstPayload.authorization.profile).toBe("maintenance_window");
    expect(first.audit?.metadata?.effectiveClassification).toBe("disruptive");
    expect(JSON.stringify(first.audit)).not.toContain(grant.grantToken);

    const second = await handleTool(
      "superops_scripts_execute",
      { scriptId: "s-reboot-2", assetId: "asset-1", authorizationGrant: grant.grantToken, requestId: "req-b-02" },
      namedScriptClient("s-reboot-2", "Reboot workstation", "asset-1"),
      config
    );
    const secondPayload = JSON.parse(second.content[0]?.text ?? "{}") as {
      classification: string;
      authorization: { result: string };
    };
    expect(secondPayload.classification).toBe("disruptive");
    expect(secondPayload.authorization.result).toBe("preauthorized_by_scoped_grant");

    await expect(
      handleTool(
        "superops_scripts_execute",
        { scriptId: "s-wipe", assetId: "asset-1", authorizationGrant: grant.grantToken },
        namedScriptClient("s-wipe", "Delete user profile", "asset-1"),
        config
      )
    ).rejects.toBeInstanceOf(AuthorizationRequiredError);
  });

  it("preauthorizes scoped disruptive and destructive actions under Rules C without rewriting classification", async () => {
    const grant = await issueGrant(
      {
        profile: "authorized_build",
        task: "Build NEW-SRV01 under Rules C",
        targets: [{ type: "asset", id: "asset-1", label: "NEW-SRV01" }],
      },
      "C"
    );
    const disruptive = JSON.parse(
      (
        await handleTool(
          "superops_scripts_execute",
          { scriptId: "s-reboot", assetId: "asset-1", authorizationGrant: grant.grantToken, requestId: "req-c-01" },
          namedScriptClient("s-reboot", "Reboot server", "asset-1"),
          config
        )
      ).content[0]?.text ?? "{}"
    ) as { classification: string; authorization: { result: string; profile: string } };
    expect(disruptive.classification).toBe("disruptive");
    expect(disruptive.authorization.result).toBe("preauthorized_by_scoped_grant");

    const destructive = await handleTool(
      "superops_scripts_execute",
      { scriptId: "s-wipe", assetId: "asset-1", authorizationGrant: grant.grantToken, requestId: "req-c-02" },
      namedScriptClient("s-wipe", "Delete user profile", "asset-1"),
      config
    );
    const destructivePayload = JSON.parse(destructive.content[0]?.text ?? "{}") as {
      classification: string;
      authorization: { result: string; profile: string };
    };
    expect(destructive.isError).toBeFalsy();
    expect(destructivePayload.classification).toBe("destructive");
    expect(destructivePayload.authorization.result).toBe("preauthorized_by_scoped_grant");
    expect(destructivePayload.authorization.profile).toBe("authorized_build");
    expect(destructive.audit?.metadata?.effectiveClassification).toBe("destructive");
    expect(destructive.audit?.metadata?.authorizationProfile).toBe("authorized_build");

    const cleanup = await handleTool(
      "superops_scripts_execute",
      { scriptId: "s-temp", assetId: "asset-1", authorizationGrant: grant.grantToken, requestId: "req-c-03" },
      namedScriptClient("s-temp", "Delete temporary files", "asset-1"),
      config
    );
    const cleanupPayload = JSON.parse(cleanup.content[0]?.text ?? "{}") as {
      classification: string;
      authorization: { result: string };
    };
    expect(cleanupPayload.classification).toBe("write_low");
    expect(cleanupPayload.authorization.result).toBe("preauthorized_by_scoped_grant");
  });

  it("refuses out-of-scope destructive action even under Rules C", async () => {
    const grant = await issueGrant(
      {
        profile: "C",
        task: "Build NEW-SRV01",
        targets: [{ type: "asset", id: "asset-1", label: "NEW-SRV01" }],
      },
      "C"
    );
    let mutated = false;
    const client = clientFor((query) => {
      if (query.includes("getScriptList")) {
        return {
          getScriptList: {
            scripts: [{ scriptId: "s-wipe", name: "Delete user profile" }],
            listInfo: { page: 1, pageSize: 5, hasMore: false },
          },
        };
      }
      if (query.includes("query getAsset(")) {
        return { getAsset: { assetId: "asset-2", hostName: "PROD-DC01", client: { accountId: "acc1" } } };
      }
      if (query.includes("mutation")) {
        mutated = true;
        return { runScriptOnAsset: { actionConfigId: "nope" } };
      }
      throw new Error(query.slice(0, 80));
    });
    const result = await handleTool(
      "superops_scripts_execute",
      { scriptId: "s-wipe", assetId: "asset-2", authorizationGrant: grant.grantToken },
      client,
      config
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/outside the human-authorized grant scope/i);
    expect(result.audit?.errorCode).toBe("scope_violation");
    expect(mutated).toBe(false);
  });

  it("rejects a tampered grant that expands profile, target, consequence, or expiry", async () => {
    const grant = await issueGrant(
      {
        profile: "B",
        task: "Maintenance",
        targets: [{ type: "asset", id: "asset-1" }],
      },
      "B"
    );
    const parsed = verifyHmacToken<GrantClaims>(grant.grantToken, config, HMAC_PURPOSE_GRANT);
    expect(parsed).toBeDefined();
    const tamper = (patch: Partial<GrantClaims>) => {
      const next = { ...parsed!, ...patch };
      const payload = Buffer.from(JSON.stringify(next), "utf8").toString("base64url");
      const mac = grant.grantToken.split(".")[1];
      return `${payload}.${mac}`;
    };
    for (const token of [
      tamper({ profile: "authorized_build", maxConsequence: "destructive" }),
      tamper({ assetIds: ["asset-1", "asset-2"] }),
      tamper({ exp: parsed!.exp + 86_400_000 }),
      tamper({ targets: [{ type: "asset", id: "other" }] }),
    ]) {
      await expect(
        handleTool(
          "superops_scripts_execute",
          { scriptId: "s-reboot", assetId: "asset-1", authorizationGrant: token },
          scriptClient("Reboot server"),
          config
        )
      ).resolves.toMatchObject({ isError: true });
    }
  });

  it("rejects an expired grant and a grant for a different asset", async () => {
    const expired: GrantClaims = {
      v: 1,
      kind: "authorization_grant",
      profile: "maintenance_window",
      task: "expired",
      ticketIds: [],
      ticketDisplayIds: [],
      assetIds: ["asset-1"],
      clientAccountIds: [],
      alertIds: [],
      siteIds: [],
      targets: [{ type: "asset", id: "asset-1" }],
      exclusions: [],
      maxConsequence: "disruptive",
      terminateOnTicketResolved: false,
      issuedAt: Date.now() - 120_000,
      exp: Date.now() - 1_000,
      nonce: "expired-nonce",
    };
    const expiredToken = mintAuthorizationGrant(expired, config);
    const expiredResult = await handleTool(
      "superops_scripts_execute",
      { scriptId: "s-reboot", assetId: "asset-1", authorizationGrant: expiredToken },
      scriptClient("Reboot server"),
      config
    );
    expect(expiredResult.isError).toBe(true);
    expect(expiredResult.audit?.errorCode).toBe("grant_expired");

    const grant = await issueGrant(
      { profile: "B", task: "asset A only", targets: [{ type: "asset", id: "asset-A" }] },
      "B"
    );
    const cross = await handleTool(
      "superops_scripts_execute",
      { scriptId: "s-reboot", assetId: "asset-B", authorizationGrant: grant.grantToken },
      namedScriptClient("s-reboot", "Reboot server", "asset-B"),
      config
    );
    expect(cross.isError).toBe(true);
    expect(cross.audit?.errorCode).toBe("scope_violation");
  });

  it("reports effective runtime classification for notes and scripts", async () => {
    const privateNote = await handleTool(
      "superops_tickets_add_note",
      { ticket: "t1", content: "internal", privacyType: "PRIVATE" },
      ticketClient(),
      config
    );
    expect(JSON.parse(privateNote.content[0]?.text ?? "{}").classification).toBe("write_low");
    expect(privateNote.audit?.metadata?.effectiveClassification).toBe("write_low");
    expect(privateNote.audit?.metadata?.registeredClassification).toBe("write_low");

    const publicNote = await handleTool(
      "superops_tickets_add_note",
      { ticket: "t1", content: "customer visible", privacyType: "PUBLIC" },
      ticketClient(),
      config
    );
    expect(JSON.parse(publicNote.content[0]?.text ?? "{}").classification).toBe("write_visible");
    expect(publicNote.audit?.metadata?.effectiveClassification).toBe("write_visible");
    expect(publicNote.audit?.metadata?.registeredClassification).toBe("write_low");

    try {
      await handleTool(
        "superops_scripts_execute",
        { scriptId: "s-reboot", assetId: "asset-1" },
        scriptClient("Reboot server"),
        config
      );
      throw new Error("expected elicit");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationRequiredError);
      if (error instanceof AuthorizationRequiredError) {
        expect(error.classification).toBe("disruptive");
      }
    }
  });

  it("does not put raw grant tokens in audit records", async () => {
    const grant = await issueGrant(
      { profile: "B", task: "audit check", targets: [{ type: "asset", id: "asset-1" }] },
      "B"
    );
    const inspect = await handleTool(
      "rpmc_authorization_inspect_grant",
      { authorizationGrant: grant.grantToken },
      clientFor(() => ({})),
      config
    );
    const blob = JSON.stringify(inspect.audit);
    expect(blob).not.toContain(grant.grantToken);
    expect(blob).not.toMatch(/authorizationGrant":"/);
    expect(inspect.audit?.metadata?.authorizationGrantPresent).toBe(true);
  });
});

describe("ticket Resolved vs Closed authority", () => {
  it("allows Resolved without a close flag and refuses Closed without explicit instruction", async () => {
    const resolved = await handleTool(
      "superops_tickets_update",
      { ticket: "t1", status: "Resolved" },
      ticketClient(),
      config
    );
    expect(resolved.isError).toBeFalsy();
    expect(JSON.parse(resolved.content[0]?.text ?? "{}").classification).toBe("write_visible");

    const closed = await handleTool(
      "superops_tickets_update",
      { ticket: "t1", status: "Closed" },
      ticketClient(),
      config
    );
    expect(closed.isError).toBe(true);
    expect(closed.content[0]?.text).toMatch(/lifecycle=close/i);
    expect(closed.auditDetail).toBe("close_requires_explicit_instruction");

    const explicit = await handleTool(
      "superops_tickets_update",
      { ticket: "t1", status: "Closed", lifecycle: "close" },
      clientFor((query) => {
        if (query.includes("query getTicket(")) {
          return { getTicket: { ticketId: "t1", displayId: "220826-0001", status: "Resolved", client: { accountId: "acc1" } } };
        }
        if (query.includes("mutation updateTicket")) return { updateTicket: { ticketId: "t1", status: "Closed" } };
        throw new Error(query.slice(0, 80));
      }),
      config
    );
    expect(explicit.isError).toBeFalsy();
    expect(JSON.parse(explicit.content[0]?.text ?? "{}").classification).toBe("write_visible");
  });
});
