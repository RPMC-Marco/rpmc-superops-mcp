import { describe, expect, it } from "vitest";
import { sanitizeOutput } from "./safe-output.js";

describe("safe output", () => {
  it("redacts credential-like strings in nested GraphQL payloads", () => {
    const result = sanitizeOutput({
      getTicketList: {
        tickets: [{ subject: "VPN down", notes: "password: hunter2" }],
      },
    });
    const payload = result.payload as {
      getTicketList: { tickets: Array<{ notes: string }> };
      _privacy: { credentialsRedacted: boolean };
    };
    expect(result.privacy.credentialsRedacted).toBe(true);
    expect(payload.getTicketList.tickets[0]?.notes).toContain("[redacted]");
    expect(payload.getTicketList.tickets[0]?.notes).not.toContain("hunter2");
    expect(payload._privacy.credentialsRedacted).toBe(true);
  });

  it("does not drop ordinary technical evidence", () => {
    const result = sanitizeOutput({
      getAsset: { name: "FW-01", serial: "ABC123", status: "Online" },
    });
    expect(result.privacy.credentialsRedacted).toBe(false);
    expect(result.payload).toEqual({
      getAsset: { name: "FW-01", serial: "ABC123", status: "Online" },
    });
  });

  it("strips HTML in conversation content fields and marks it", () => {
    const result = sanitizeOutput({
      conversations: [{ content: "<p>Printer jam</p>" }],
    });
    const payload = result.payload as {
      conversations: Array<{ content: string }>;
      _privacy: { htmlStripped: boolean };
    };
    expect(payload.conversations[0]?.content).toBe("Printer jam");
    expect(payload._privacy.htmlStripped).toBe(true);
  });
});
