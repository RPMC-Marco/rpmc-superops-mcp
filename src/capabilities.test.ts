import { describe, expect, it } from "vitest";
import { registeredToolNames, unregisteredWriteNames } from "./capabilities.js";

describe("capability registry", () => {
  it("registers only Phase 1 reads", () => {
    const registered = registeredToolNames();
    expect(registered).toContain("rpmc_status");
    expect(registered).toContain("superops_tickets_get");
    expect(registered).toContain("investigate_ticket");
    expect(new Set(registered).size).toBe(registered.length);
  });

  it("does not register write, mutation, or script tools", () => {
    const registered = new Set(registeredToolNames());
    const writes = unregisteredWriteNames();
    expect(writes.length).toBeGreaterThan(0);
    for (const name of writes) {
      expect(registered.has(name)).toBe(false);
    }
    expect(registered.has("superops_custom_mutation")).toBe(false);
    expect(registered.has("superops_scripts_execute")).toBe(false);
    expect(registered.has("superops_tickets_create")).toBe(false);
    expect(registered.has("superops_tickets_update")).toBe(false);
    expect(registered.has("superops_tickets_add_note")).toBe(false);
    expect(registered.has("superops_alerts_resolve")).toBe(false);
  });

  it("never registers mutation-kind operations even if a read label were set", () => {
    const registered = new Set(registeredToolNames());
    expect(registered.has("superops_custom_mutation")).toBe(false);
    expect(unregisteredWriteNames()).toContain("superops_custom_mutation");
  });
});
