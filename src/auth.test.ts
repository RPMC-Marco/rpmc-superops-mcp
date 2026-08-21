import { describe, expect, it } from "vitest";
import { authorizeMcpRequest, extractBearerToken, tokensEqual } from "./auth.js";

describe("auth", () => {
  it("extracts a bearer token with exact Authorization syntax", () => {
    expect(extractBearerToken({ authorization: "Bearer secret-value" })).toBe("secret-value");
    expect(extractBearerToken({ authorization: "bearer secret-value" })).toBe("secret-value");
  });

  it("rejects malformed Authorization headers", () => {
    expect(extractBearerToken({ authorization: "Bearer" })).toBeUndefined();
    expect(extractBearerToken({ authorization: "Bearer token extra" })).toBeUndefined();
    expect(extractBearerToken({ authorization: "Basic secret-value" })).toBeUndefined();
    expect(extractBearerToken({ authorization: ["Bearer a", "Bearer b"] })).toBeUndefined();
    expect(extractBearerToken({ authorization: " Bearer  spaced" })).toBeUndefined();
  });

  it("rejects missing or wrong tokens", () => {
    expect(authorizeMcpRequest({}, "expected")).toBe(false);
    expect(authorizeMcpRequest({ authorization: "Bearer other" }, "expected")).toBe(false);
    expect(authorizeMcpRequest({ authorization: "Bearer expected" }, "expected")).toBe(true);
    expect(authorizeMcpRequest({ authorization: "Bearer expected" }, undefined)).toBe(false);
  });

  it("compares tokens without throwing on length mismatch", () => {
    expect(tokensEqual("a", "bb")).toBe(false);
    expect(tokensEqual("same", "same")).toBe(true);
  });
});
