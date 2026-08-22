import { describe, expect, it } from "vitest";
import { classifyScriptConsequence } from "./scripts.js";

describe("script consequence classification", () => {
  it("does not treat disposable temp-file deletion as destructive", () => {
    const result = classifyScriptConsequence({
      name: "Delete temporary files",
      description: "Remove-Item temp installer files from %TEMP%",
    });
    expect(result.classification).toBe("write_low");
    expect(result.unknown).toBe(false);
  });

  it("does not treat regeneratable cache cleanup as destructive", () => {
    expect(
      classifyScriptConsequence({ name: "Clear DNS cache", description: "ipconfig /flushdns" }).classification
    ).toBe("write_low");
    expect(
      classifyScriptConsequence({
        name: "Clear regeneratable application cache",
        description: "clears disposable app cache files",
      }).classification
    ).toBe("write_low");
  });

  it("classifies user-profile deletion as destructive", () => {
    expect(classifyScriptConsequence({ name: "Delete user profile" }).classification).toBe("destructive");
    expect(classifyScriptConsequence({ description: "Remove the user profile from the endpoint" }).classification).toBe(
      "destructive"
    );
  });

  it("classifies production/business-data deletion as destructive", () => {
    expect(
      classifyScriptConsequence({ name: "Cleanup", description: "Delete production files on the file share" }).classification
    ).toBe("destructive");
    expect(classifyScriptConsequence({ name: "Remove business data from the workstation" }).classification).toBe(
      "destructive"
    );
  });

  it("classifies backup/recovery destruction as destructive", () => {
    expect(classifyScriptConsequence({ name: "Destroy backups" }).classification).toBe("destructive");
    expect(classifyScriptConsequence({ description: "Delete recovery data and restore points" }).classification).toBe(
      "destructive"
    );
  });

  it("classifies recoverable cleanup that interrupts a service as disruptive, not destructive", () => {
    expect(
      classifyScriptConsequence({
        name: "Clear application cache",
        description: "Clear regeneratable cache then restart the service",
      }).classification
    ).toBe("disruptive");
    expect(classifyScriptConsequence({ name: "Uninstall and reinstall printer driver" }).classification).toBe("disruptive");
  });

  it("does not equate delete/remove/clear keywords alone with destructive", () => {
    const verbs = classifyScriptConsequence({
      name: "Custom helper",
      description: "Uses Remove-Item, del, rm, and Clear-Item",
    });
    expect(verbs.classification).not.toBe("destructive");
    expect(verbs.classification).toBe("disruptive");
    expect(verbs.unknown).toBe(true);
  });

  it("still classifies reboot as disruptive and diagnostics as write_low", () => {
    expect(classifyScriptConsequence({ name: "Reboot server" }).classification).toBe("disruptive");
    expect(classifyScriptConsequence({ description: "diagnostic collection" }).classification).toBe("write_low");
  });
});
