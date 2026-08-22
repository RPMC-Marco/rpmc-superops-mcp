import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import {
  buildConfirmationMessage,
  mintChallengeToken,
  requireHumanAuthorization,
  verifyChallengeToken,
} from "./authorization.js";
import { AuthorizationRequiredError } from "./errors.js";
import { classifyScriptConsequence } from "./scripts.js";
import { IdempotencyStore } from "./idempotency.js";

const config = loadConfig({
  MCP_TRANSPORT: "stdio",
  SUPEROPS_API_TOKEN: "so-secret-token-value-for-tests",
  SUPEROPS_SUBDOMAIN: "demo",
});

describe("write authorization", () => {
  it("mints a challenge that cannot be reused for a different target", () => {
    const token = mintChallengeToken(
      {
        v: 1,
        action: "runScriptOnAsset",
        targetType: "asset",
        targetId: "asset-1",
        consequence: "disruptive",
        paramDigest: "abc",
        exp: Date.now() + 60_000,
        nonce: "n1",
      },
      config
    );
    const parsed = verifyChallengeToken(token, config);
    expect(parsed?.targetId).toBe("asset-1");
    const [payload, mac] = token.split(".");
    const tamperedPayload = `${payload.slice(0, -2)}xx`;
    expect(verifyChallengeToken(`${tamperedPayload}.${mac}`, config)).toBeUndefined();
    expect(verifyChallengeToken(`${payload}.${mac.slice(1)}x`, config)).toBeUndefined();
  });

  it("requires elicitation and rejects a declined confirmation", () => {
    expect(() =>
      requireHumanAuthorization({
        config,
        toolName: "superops_scripts_execute",
        action: "runScriptOnAsset",
        target: { type: "asset", id: "RMS-FS01", label: "RMS-FS01" },
        consequence: "disruptive",
        paramDigest: "x",
        impact: "Active file-share access will be interrupted.",
        reversibility: "Not automatically reversible.",
      })
    ).toThrow(AuthorizationRequiredError);

    const declined = requireHumanAuthorization({
      config,
      ctx: { inputResponses: { confirm: { action: "decline" } } },
      toolName: "superops_scripts_execute",
      action: "runScriptOnAsset",
      target: { type: "asset", id: "RMS-FS01" },
      consequence: "disruptive",
      paramDigest: "x",
      impact: "interrupt",
      reversibility: "none",
    });
    expect(declined.result).toBe("declined");
  });

  it("accepts only a matching typed target plus HMAC-scoped challenge", () => {
    try {
      requireHumanAuthorization({
        config,
        toolName: "superops_scripts_execute",
        action: "runScriptOnAsset",
        target: { type: "asset", id: "asset-1", label: "RMS-FS01" },
        consequence: "disruptive",
        paramDigest: "digest-1",
        impact: "reboot",
        reversibility: "none",
      });
      throw new Error("expected throw");
    } catch (error) {
      if (!(error instanceof AuthorizationRequiredError)) throw error;
      const accepted = requireHumanAuthorization({
        config,
        ctx: {
          requestState: error.elicit.requestState,
          inputResponses: { confirm: { action: "accept", content: { confirm: true, typedTarget: "RMS-FS01" } } },
        },
        toolName: "superops_scripts_execute",
        action: "runScriptOnAsset",
        target: { type: "asset", id: "asset-1", label: "RMS-FS01" },
        consequence: "disruptive",
        paramDigest: "digest-1",
        impact: "reboot",
        reversibility: "none",
      });
      expect(accepted.result).toBe("accepted");
      expect(() =>
        requireHumanAuthorization({
          config,
          ctx: {
            requestState: error.elicit.requestState,
            inputResponses: { confirm: { action: "accept", content: { confirm: true, typedTarget: "OTHER-PC" } } },
          },
          toolName: "superops_scripts_execute",
          action: "runScriptOnAsset",
          target: { type: "asset", id: "asset-1", label: "RMS-FS01" },
          consequence: "disruptive",
          paramDigest: "digest-1",
          impact: "reboot",
          reversibility: "none",
        })
      ).toThrow(AuthorizationRequiredError);
    }
    expect(buildConfirmationMessage({
      action: "runScriptOnAsset",
      target: { type: "asset", id: "asset-1", label: "RMS-FS01" },
      consequence: "disruptive",
      impact: "Active file-share access will be interrupted.",
      reversibility: "Not automatically reversible.",
    })).toMatch(/RMS-FS01/);
  });
});

describe("idempotency store", () => {
  it("blocks an in-flight duplicate and returns a completed result", () => {
    const store = new IdempotencyStore(60_000, () => 1);
    const fp = store.fingerprint("superops_tickets_create", "acc1", { subject: "TEST" });
    expect(store.begin(fp, "rid-1").ok).toBe(true);
    expect(store.begin(fp, "rid-1").reason).toBe("in_flight");
    store.complete(fp, {
      outcome: "complete",
      mutation: "createTicket",
      toolName: "superops_tickets_create",
      classification: "write_visible",
      authorization: { required: false, result: "not_required" },
      target: { type: "ticket", id: "t1" },
      result: {},
      verification: { result: "complete", compared: {} },
      logicalOperations: [],
    });
    const replay = store.begin(fp, "rid-1");
    expect(replay.ok).toBe(false);
    expect(replay.reason).toBe("duplicate");
    store.markUncertain(store.fingerprint("other", "x", {}));
  });
});

describe("script classification", () => {
  it("classifies reboot as disruptive and delete as destructive", () => {
    expect(classifyScriptConsequence({ name: "Reboot server" }).classification).toBe("disruptive");
    expect(classifyScriptConsequence({ name: "Delete user profile" }).classification).toBe("destructive");
    expect(classifyScriptConsequence({ description: "diagnostic collection" }).classification).toBe("write_low");
  });
});
