import { describe, expect, it } from "vitest";
import { kbArticleHtml, kbLoginRequired, kbVisibility } from "./kb.js";

describe("KB article live SuperOps contract", () => {
  it("wraps fragment HTML in an html/body document and leaves full documents unchanged", () => {
    expect(kbArticleHtml("<p>TEST</p>")).toBe("<html><body><p>TEST</p></body></html>");
    expect(kbArticleHtml("<html><body><p>TEST</p></body></html>")).toBe(
      "<html><body><p>TEST</p></body></html>"
    );
  });

  it("defaults loginRequired to true because false ISE'd on the RPMC tenant", () => {
    expect(kbLoginRequired(undefined)).toBe(true);
    expect(kbLoginRequired(true)).toBe(true);
    expect(kbLoginRequired(false)).toBe(false);
  });

  it("shares technician drafts with AllUsers and AllGroups", () => {
    expect(kbVisibility("technicians")).toEqual({
      added: [{ portalType: "TECHNICIAN", userSharedType: "AllUsers", groupSharedType: "AllGroups" }],
    });
  });
});
