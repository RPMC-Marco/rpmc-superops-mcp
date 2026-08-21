import { describe, expect, it } from "vitest";
import { exclusiveStringIdentity, hasAnyFilter, inLastDays, pageClamp } from "./conditions.js";

describe("conditions helpers", () => {
  it("rejects multiple identity fields", () => {
    const result = exclusiveStringIdentity({ assetId: "1", hostName: "PC" }, ["assetId", "hostName"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("malformed_input");
  });

  it("builds inLast day conditions and clamps page size", () => {
    expect(inLastDays("createdTime", 7)).toEqual({
      attribute: "createdTime",
      operator: "inLast",
      value: { unit: "DAY", quantity: 7 },
    });
    expect(pageClamp(2, 999, 25, 50)).toEqual({ page: 2, pageSize: 50 });
    expect(hasAnyFilter({ status: "Open" }, ["status", "clientName"])).toBe(true);
    expect(hasAnyFilter({}, ["status"])).toBe(false);
  });
});
