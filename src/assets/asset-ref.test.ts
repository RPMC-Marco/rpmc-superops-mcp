import { describe, expect, it } from "vitest";
import { classifyAssetRef } from "./asset-ref.js";

describe("classifyAssetRef", () => {
  it("recognizes numeric SuperOps assetIds", () => {
    expect(classifyAssetRef("9001114136934215681")).toEqual({
      kind: "assetId",
      value: "9001114136934215681",
    });
  });

  it("treats hostName, name, and serial-like values as unsupported human identifiers", () => {
    expect(classifyAssetRef("DESKTOP-9J8RLGD").kind).toBe("unsupported_human");
    expect(classifyAssetRef("FRONT-DESK-PC").kind).toBe("unsupported_human");
    expect(classifyAssetRef("15CD10509R721").kind).toBe("unsupported_human");
  });

  it("rejects empty identifiers", () => {
    expect(classifyAssetRef("").kind).toBe("malformed");
    expect(classifyAssetRef("   ").kind).toBe("malformed");
  });

  it("does not guess among spaced names", () => {
    expect(classifyAssetRef("Acme Laptop").kind).toBe("unsupported_human");
  });
});
