import { describe, expect, it } from "vitest";
import { buildCommit } from "./build-info.js";

describe("buildCommit", () => {
  it("returns unknown when RPM_BUILD_COMMIT is unset", () => {
    const previous = process.env.RPM_BUILD_COMMIT;
    delete process.env.RPM_BUILD_COMMIT;
    try {
      expect(buildCommit()).toBe("unknown");
    } finally {
      if (previous === undefined) delete process.env.RPM_BUILD_COMMIT;
      else process.env.RPM_BUILD_COMMIT = previous;
    }
  });

  it("returns the injected build identifier", () => {
    const previous = process.env.RPM_BUILD_COMMIT;
    process.env.RPM_BUILD_COMMIT = "abc123def";
    try {
      expect(buildCommit()).toBe("abc123def");
    } finally {
      if (previous === undefined) delete process.env.RPM_BUILD_COMMIT;
      else process.env.RPM_BUILD_COMMIT = previous;
    }
  });
});
