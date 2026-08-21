import { describe, expect, it } from "vitest";
import { toClientSafeError } from "./errors.js";
import { SuperOpsError, SuperOpsHttpError } from "../superops/errors.js";
import { loadConfig } from "../config.js";
import { SuperOpsClient } from "../superops/client.js";
import { handleTool } from "../tools/handlers.js";

const stdioEnv = {
  MCP_TRANSPORT: "stdio",
  SUPEROPS_API_TOKEN: "so-secret",
  SUPEROPS_SUBDOMAIN: "demo",
  SUPEROPS_REGION: "us",
};

describe("client-safe errors", () => {
  it("does not return credential-like text from generic errors", () => {
    const message = toClientSafeError(new Error("upstream failed password: hunter2"));
    expect(message).toContain("[redacted]");
    expect(message).not.toContain("hunter2");
  });

  it("maps SuperOps HTTP failures to a controlled message", () => {
    const message = toClientSafeError(
      new SuperOpsHttpError("HTTP error: 500 body password: hunter2", 500, "Internal Server Error")
    );
    expect(message).toBe("SuperOps HTTP error");
    expect(message).not.toContain("hunter2");
  });

  it("maps SuperOps GraphQL errors without returning extensions or ticket text", () => {
    const message = toClientSafeError(
      new SuperOpsError("ticket body password: hunter2", "BAD", undefined, { raw: "secret" })
    );
    expect(message).toBe("SuperOps request failed");
  });

  it("sanitizes handler catch output", async () => {
    const config = loadConfig(stdioEnv);
    const client = new SuperOpsClient(
      { apiToken: "t", subdomain: "d", region: "us" },
      {
        requestTimeoutMs: 1000,
        maxReadRetries: 1,
        maxRetryDurationMs: 1000,
        fetchImpl: async () => {
          throw new Error("Authorization Bearer supersecrettokenvalue");
        },
      }
    );
    const result = await handleTool("superops_test_connection", {}, client, config);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/^Error: /);
    expect(result.content[0]?.text).not.toContain("supersecrettokenvalue");
    expect(result.auditDetail).toBeDefined();
    expect(result.auditDetail).not.toContain("supersecrettokenvalue");
  });
});
