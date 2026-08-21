import { describe, expect, it } from "vitest";
import { parseAssetId } from "./asset-ref.js";

describe("parseAssetId", () => {
  it("accepts official example IDs and other opaque GraphQL IDs", () => {
    expect(parseAssetId("9001114136934215681")).toEqual({ ok: true, value: "9001114136934215681" });
    expect(parseAssetId("4")).toEqual({ ok: true, value: "4" });
    expect(parseAssetId("  abc-ID_1  ")).toEqual({ ok: true, value: "abc-ID_1" });
  });

  it("rejects empty or whitespace-containing values", () => {
    expect(parseAssetId("").ok).toBe(false);
    expect(parseAssetId("   ").ok).toBe(false);
    expect(parseAssetId("9001 1413").ok).toBe(false);
  });
});
