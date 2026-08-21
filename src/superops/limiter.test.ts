import { describe, expect, it } from "vitest";
import { MinuteLimiter, clampPageSize, SUPEROPS_MAX_PAGE_SIZE } from "./limiter.js";

describe("limiter", () => {
  it("caps page size at the official maximum", () => {
    expect(clampPageSize(500)).toBe(SUPEROPS_MAX_PAGE_SIZE);
    expect(clampPageSize(10)).toBe(10);
  });

  it("enforces 100 requests per minute", () => {
    let now = 0;
    const limiter = new MinuteLimiter(100, () => now);
    for (let i = 0; i < 100; i += 1) {
      expect(limiter.tryAcquire()).toBe(true);
    }
    expect(limiter.tryAcquire()).toBe(false);
    now = 60_001;
    expect(limiter.tryAcquire()).toBe(true);
  });
});
