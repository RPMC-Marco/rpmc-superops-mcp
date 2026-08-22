import { describe, expect, it } from "vitest";
import { registeredToolNames, unregisteredWriteNames } from "./capabilities.js";

describe("capability registry", () => {
  it("registers only Phase 1 reads", () => {
    const registered = registeredToolNames();
    expect(registered).toContain("rpmc_status");
    expect(registered).toContain("superops_tickets_get");
    expect(registered).toContain("investigate_ticket");
    expect(registered).toContain("investigate_asset");
    expect(registered).toContain("investigate_client");
    expect(registered).toContain("superops_tickets_search");
    expect(registered).toContain("superops_assets_search");
    expect(registered).toContain("superops_alerts_search");
    expect(registered).toContain("superops_sites_list");
    expect(registered).toContain("superops_fields_all");
    expect(registered).toContain("superops_worklogs_list");
    expect(new Set(registered).size).toBe(registered.length);
  });

  it("registers Phase 2 purpose-built writes and never registers generic mutation", () => {
    const registered = new Set(registeredToolNames());
    expect(registered.has("superops_tickets_create")).toBe(true);
    expect(registered.has("superops_tickets_update")).toBe(true);
    expect(registered.has("superops_tickets_add_note")).toBe(true);
    expect(registered.has("superops_tickets_add_conversation")).toBe(true);
    expect(registered.has("superops_worklogs_create")).toBe(true);
    expect(registered.has("superops_alerts_resolve")).toBe(true);
    expect(registered.has("superops_scripts_execute")).toBe(true);
    expect(registered.has("rpmc_authorization_request_grant")).toBe(true);
    expect(registered.has("rpmc_authorization_inspect_grant")).toBe(true);
    expect(registered.has("rpmc_authorization_revoke_grant")).toBe(true);
    expect(registered.has("superops_custom_mutation")).toBe(false);
    expect(unregisteredWriteNames()).toContain("superops_custom_mutation");
  });

  it("never registers mutation-kind operations even if a read label were set", () => {
    const registered = new Set(registeredToolNames());
    expect(registered.has("superops_custom_mutation")).toBe(false);
    expect(unregisteredWriteNames()).toContain("superops_custom_mutation");
  });

  it("can omit writes when writesEnabled is false", () => {
    const registered = new Set(registeredToolNames({ writesEnabled: false }));
    expect(registered.has("superops_tickets_get")).toBe(true);
    expect(registered.has("superops_tickets_create")).toBe(false);
    expect(registered.has("rpmc_authorization_request_grant")).toBe(false);
    expect(registered.has("superops_custom_mutation")).toBe(false);
  });
});
