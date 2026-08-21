import { describe, expect, it } from "vitest";
import { redactSecrets, sanitizeTicketText } from "./redact.js";

describe("privacy", () => {
  it("redacts credential-like text and reports that it did so", () => {
    const result = sanitizeTicketText("Please use password: hunter2 and keep going");
    expect(result.credentialsRedacted).toBe(true);
    expect(result.text).toContain("[redacted]");
    expect(result.text).not.toContain("hunter2");
  });

  it("strips HTML and marks the change", () => {
    const result = sanitizeTicketText("<p>Hello<br/>world</p>");
    expect(result.htmlStripped).toBe(true);
    expect(result.text).toMatch(/Hello/);
    expect(result.text).not.toContain("<p>");
  });

  it("does not silently drop ordinary ticket text", () => {
    const result = sanitizeTicketText("Printer offline in building B");
    expect(result.credentialsRedacted).toBe(false);
    expect(result.text).toBe("Printer offline in building B");
  });

  it("does not treat freeform email addresses as credentials", () => {
    const result = sanitizeTicketText("Please reply to ops@client.com about the outage");
    expect(result.credentialsRedacted).toBe(false);
    expect(result.text).toContain("ops@client.com");
  });

  it("redacts bearer tokens", () => {
    const result = redactSecrets("Authorization Bearer abcdefghijklmnop1234");
    expect(result.credentialsRedacted).toBe(true);
  });
});
