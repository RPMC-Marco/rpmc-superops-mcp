import { describe, expect, it } from "vitest";
import { applyItDocSecretPolicy, redactSecretCustomFields } from "./custom-fields.js";

const SYNTHETIC_CANONICAL = "AAAAA-BBBBB-CCCCC-DDDDD-EEEEE";
const SYNTHETIC_NONCANONICAL = "office-pack-temp-key-9182";

describe("IT documentation secret-field policy", () => {
  it("redacts a canonical Product Key field and keeps the product name", () => {
    const result = redactSecretCustomFields({
      udf3text: "Contoso Office Suite",
      udf6text: SYNTHETIC_CANONICAL,
    });
    expect(result.customFields).toEqual({ udf3text: "Contoso Office Suite", udf6text: null });
    expect(JSON.stringify(result)).not.toContain(SYNTHETIC_CANONICAL);
    expect(result.redactions[0]?.reason).toBe("license_key_value");
  });

  it("redacts a non-canonical Product Key value when the document is a license record", () => {
    const result = applyItDocSecretPolicy({
      name: "Office Product Key",
      customFields: { "Product Key": SYNTHETIC_NONCANONICAL, Product: "Contoso Office Suite" },
    });
    const rec = result as { customFields: Record<string, unknown> };
    expect(rec.customFields["Product Key"]).toBeNull();
    expect(rec.customFields.Product).toBe("Contoso Office Suite");
    expect(JSON.stringify(result)).not.toContain(SYNTHETIC_NONCANONICAL);
  });

  it("redacts Key and Serial map entries in a Product Key document even when values are not canonical", () => {
    const result = applyItDocSecretPolicy({
      name: "Contoso Office license",
      customFields: { Key: SYNTHETIC_NONCANONICAL, Serial: "LICENSE-SERIAL-9911", Product: "Contoso Office" },
    });
    const rec = result as { customFields: Record<string, unknown> };
    expect(rec.customFields.Key).toBeNull();
    expect(rec.customFields.Serial).toBeNull();
    expect(rec.customFields.Product).toBe("Contoso Office");
    expect(JSON.stringify(result)).not.toContain(SYNTHETIC_NONCANONICAL);
    expect(JSON.stringify(result)).not.toContain("LICENSE-SERIAL-9911");
  });

  it("never returns PASSWORD values", () => {
    const result = redactSecretCustomFields([
      { columnName: "udf1", label: "Notes", fieldType: "PASSWORD", value: "synth-password-value" },
    ]);
    expect((result.customFields as Array<Record<string, unknown>>)[0].value).toBeNull();
    expect(result.redactions[0]?.reason).toBe("secret_field_type");
    expect(JSON.stringify(result)).not.toContain("synth-password-value");
  });

  it("never returns SECURE_TEXT values", () => {
    const result = redactSecretCustomFields([
      { columnName: "udf2", label: "Token", fieldType: "SECURE_TEXT", value: "synth-secure-text" },
    ]);
    expect((result.customFields as Array<Record<string, unknown>>)[0].value).toBeNull();
    expect(JSON.stringify(result)).not.toContain("synth-secure-text");
  });

  it("preserves ordinary hardware Serial Number fields", () => {
    const result = redactSecretCustomFields([
      { columnName: "udf8", label: "Serial Number", fieldType: "TEXT", value: "ABC12345" },
    ]);
    expect((result.customFields as Array<Record<string, unknown>>)[0].value).toBe("ABC12345");
    expect(result.redactions).toEqual([]);
  });

  it("preserves a non-secret asset serial on ordinary device documentation", () => {
    const result = applyItDocSecretPolicy({
      name: "Front desk printer",
      customFields: { "Serial Number": "PN-778812", Notes: "Installed in reception" },
    });
    const rec = result as { customFields: Record<string, unknown> };
    expect(rec.customFields["Serial Number"]).toBe("PN-778812");
    expect(rec.customFields.Notes).toBe("Installed in reception");
  });

  it("preserves ordinary technical notes and configuration", () => {
    const result = applyItDocSecretPolicy({
      name: "VPN concentrator notes",
      customFields: { Portal: "https://vpn.example", Notes: "Use site-to-site profile B" },
    });
    const rec = result as { customFields: Record<string, unknown> };
    expect(rec.customFields.Portal).toBe("https://vpn.example");
    expect(rec.customFields.Notes).toBe("Use site-to-site profile B");
  });

  it("redacts nested Key/Serial maps that do not use the canonical product-key format", () => {
    const result = applyItDocSecretPolicy({
      name: "Software license packet",
      customFields: {
        details: { Key: SYNTHETIC_NONCANONICAL, Serial: "nested-serial-value" },
        notes: "Apply to finance PCs only",
      },
    });
    const rec = result as { customFields: { details: Record<string, unknown>; notes: string } };
    expect(rec.customFields.details.Key).toBeNull();
    expect(rec.customFields.details.Serial).toBeNull();
    expect(rec.customFields.notes).toBe("Apply to finance PCs only");
    expect(JSON.stringify(result)).not.toContain(SYNTHETIC_NONCANONICAL);
    expect(JSON.stringify(result)).not.toContain("nested-serial-value");
  });
});
