import { describe, expect, it } from "vitest";
import { applyItDocSecretPolicy, redactSecretCustomFields } from "./custom-fields.js";

const SYNTHETIC_CANONICAL = "AAAAA-BBBBB-CCCCC-DDDDD-EEEEE";
const SYNTHETIC_NONCANONICAL = "office-pack-temp-key-9182";

const PRODUCT_KEY_CATEGORY = {
  typeId: "1002",
  name: "Product Key",
  customFields: [
    { columnName: "udf3text", label: "Product Name", fieldType: "TEXT" },
    { columnName: "udf4text", label: "Asset name", fieldType: "TEXT" },
    { columnName: "udf5para", label: "Notes", fieldType: "PARAGRAPH" },
    { columnName: "udf6text", label: "Key/Serial", fieldType: "TEXT" },
  ],
};

const HARDWARE_NOTE_CATEGORY = {
  typeId: "1003",
  name: "Device notes",
  customFields: [
    { columnName: "udf6text", label: "Location code", fieldType: "TEXT" },
    { columnName: "udf8", label: "Serial Number", fieldType: "TEXT" },
  ],
};

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

  it("redacts opaque udf6text when category metadata labels it Product Key", () => {
    const result = applyItDocSecretPolicy(
      {
        name: "Finance workstation license",
        customFields: { udf3text: "Contoso Office Suite", udf6text: SYNTHETIC_NONCANONICAL },
      },
      { categories: [PRODUCT_KEY_CATEGORY], typeId: "1002" }
    );
    const rec = result as { customFields: Record<string, unknown> };
    expect(rec.customFields.udf3text).toBe("Contoso Office Suite");
    expect(rec.customFields.udf6text).toBeNull();
    expect(JSON.stringify(result)).not.toContain(SYNTHETIC_NONCANONICAL);
  });

  it("redacts opaque udf6text mapped to Key/Serial in a software-license category", () => {
    const result = redactSecretCustomFields(
      { udf6text: SYNTHETIC_NONCANONICAL, udf3text: "Contoso Office" },
      { categories: [PRODUCT_KEY_CATEGORY], typeId: "1002" }
    );
    expect(result.customFields).toEqual({ udf6text: null, udf3text: "Contoso Office" });
    expect(result.redactions[0]?.reason).toBe("secret_field_label");
    expect(JSON.stringify(result)).not.toContain(SYNTHETIC_NONCANONICAL);
  });

  it("redacts a non-canonical arbitrary-looking license value because the field definition is sensitive", () => {
    const result = applyItDocSecretPolicy(
      {
        name: "RMS Office packet",
        customFields: { udf6text: "not-a-canonical-key", udf4text: "LAPTOP-12" },
      },
      { categories: [PRODUCT_KEY_CATEGORY] }
    );
    const rec = result as { customFields: Record<string, unknown> };
    expect(rec.customFields.udf6text).toBeNull();
    expect(rec.customFields.udf4text).toBe("LAPTOP-12");
    expect(JSON.stringify(result)).not.toContain("not-a-canonical-key");
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

  it("preserves normal asset serialNumber", () => {
    const result = applyItDocSecretPolicy({
      assetId: "9001114136934215681",
      name: "FS01",
      serialNumber: "SRV-SERIAL-7788",
    });
    const rec = result as { serialNumber: string };
    expect(rec.serialNumber).toBe("SRV-SERIAL-7788");
  });

  it("keeps an ordinary UDF with the same storage key when its category definition is not secret", () => {
    const result = applyItDocSecretPolicy(
      {
        name: "Front desk printer",
        customFields: { udf6text: "ROW-B-04", udf8: "PN-778812" },
      },
      { categories: [HARDWARE_NOTE_CATEGORY], typeId: "1003" }
    );
    const rec = result as { customFields: Record<string, unknown> };
    expect(rec.customFields.udf6text).toBe("ROW-B-04");
    expect(rec.customFields.udf8).toBe("PN-778812");
  });

  it("does not globally redact udf6text when category definitions conflict and no typeId is supplied", () => {
    const result = applyItDocSecretPolicy(
      {
        name: "Ambiguous record",
        customFields: { udf6text: "ROW-B-04" },
      },
      { categories: [PRODUCT_KEY_CATEGORY, HARDWARE_NOTE_CATEGORY] }
    );
    const rec = result as { customFields: Record<string, unknown> };
    expect(rec.customFields.udf6text).toBe("ROW-B-04");
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

  it("redacts a license-like substring from Product Key Notes and keeps surrounding text", () => {
    const synthetic = "12345-678-9012345-67890";
    const result = applyItDocSecretPolicy(
      {
        name: "Finance workstation license",
        customFields: {
          udf3text: "Contoso Office Suite",
          udf5para: `Installed on finance PCs. Code ${synthetic} today.`,
          udf6text: SYNTHETIC_NONCANONICAL,
        },
      },
      { categories: [PRODUCT_KEY_CATEGORY], typeId: "1002" }
    );
    const rec = result as { customFields: Record<string, unknown> };
    expect(rec.customFields.udf3text).toBe("Contoso Office Suite");
    expect(rec.customFields.udf6text).toBeNull();
    expect(rec.customFields.udf5para).toBe("Installed on finance PCs. Code [redacted] today.");
    expect(JSON.stringify(result)).not.toContain(synthetic);
    expect(JSON.stringify(result)).not.toContain(SYNTHETIC_NONCANONICAL);
  });

  it("fails closed on license-context Notes when remaining text still looks credential-like", () => {
    const blob = "synthblobABCDEFGHIJKLMNOPQRSTUVmixedvalue9182";
    const result = applyItDocSecretPolicy(
      {
        name: "Finance workstation license",
        customFields: { udf5para: `See attachment.\n${blob}` },
      },
      { categories: [PRODUCT_KEY_CATEGORY], typeId: "1002" }
    );
    const rec = result as { customFields: Record<string, unknown>; customFieldsRedaction?: Array<{ reason: string }> };
    expect(rec.customFields.udf5para).toBeNull();
    expect(rec.customFieldsRedaction?.some((item) => item.reason === "license_freeform")).toBe(true);
    expect(JSON.stringify(result)).not.toContain(blob);
  });

  it("keeps ordinary notes in a non-license category, including hyphenated inventory text", () => {
    const result = applyItDocSecretPolicy(
      {
        name: "Front desk printer",
        customFields: { udf6text: "ROW-B-04", udf8: "PN-778812", Notes: "Shelf 200826-0001, replaced 2026-12-31" },
      },
      { categories: [HARDWARE_NOTE_CATEGORY], typeId: "1003" }
    );
    const rec = result as { customFields: Record<string, unknown> };
    expect(rec.customFields.Notes).toBe("Shelf 200826-0001, replaced 2026-12-31");
    expect(rec.customFields.udf6text).toBe("ROW-B-04");
    expect(rec.customFields.udf8).toBe("PN-778812");
  });

  it("does not honor an includeSecrets-style bypass flag", () => {
    const result = applyItDocSecretPolicy(
      {
        name: "Finance workstation license",
        customFields: { udf6text: SYNTHETIC_NONCANONICAL, udf5para: "Code 12345-678-9012345-67890" },
      },
      { categories: [PRODUCT_KEY_CATEGORY], typeId: "1002", includeSecrets: true } as never
    );
    const rec = result as { customFields: Record<string, unknown> };
    expect(rec.customFields.udf6text).toBeNull();
    expect(JSON.stringify(result)).not.toContain(SYNTHETIC_NONCANONICAL);
    expect(JSON.stringify(result)).not.toContain("12345-678-9012345-67890");
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
