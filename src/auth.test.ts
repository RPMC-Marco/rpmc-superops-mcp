import { describe, expect, it } from "vitest";
import { authorizeMcpRequest, extractBearerToken, tokensEqual } from "./auth.js";

describe("auth", () => {
  it("extracts a bearer token", () => {
    expect(extractBearerToken({ authorization: "Bearer secret-value" })).toBe("secret-value");
  });

  it("rejects missing or wrong tokens", () => {
    expect(authorizeMcpRequest({}, "expected")).toBe(false);
    expect(authorizeMcpRequest({ authorization: "Bearer other" }, "expected")).toBe(false);
    expect(authorizeMcpRequest({ authorization: "Bearer expected" }, "expected")).toBe(true);
  });

  it("compares tokens without throwing on length mismatch", () => {
    expect(tokensEqual("a", "bb")).toBe(false);
    expect(tokensEqual("same", "same")).toBe(true);
  });
});
