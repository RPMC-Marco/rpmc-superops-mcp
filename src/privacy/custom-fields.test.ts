import { describe, expect, it } from "vitest";
import { applyItDocSecretPolicy, redactSecretCustomFields } from "./custom-fields.js";

describe("IT documentation secret-field policy", () => {
  it("redacts Windows-style product keys in customFields maps and keeps product names", () => {
    const result = redactSecretCustomFields({
      udf3text: "MS Office Pro Plus 2024",
      udf4text: "All PCs",
      udf6text: "CVT99-RN2W6-JHK9G-WF3DP-8XGJ3",
    });
    expect(result.customFields).toEqual({
      udf3text: "MS Office Pro Plus 2024",
      udf4text: "All PCs",
      udf6text: null,
    });
    expect(result.redactions).toEqual([
      { columnName: "udf6text", valuePresent: true, redacted: true, reason: "license_key_value" },
    ]);
  });

  it("never returns PASSWORD / SECURE_TEXT values even when the label is ordinary", () => {
    const result = redactSecretCustomFields([
      { columnName: "udf1", label: "Notes", fieldType: "PASSWORD", value: "hunter2" },
      { columnName: "udf2", label: "Portal URL", fieldType: "TEXT", value: "https://portal.example" },
    ]);
    expect((result.customFields as Array<Record<string, unknown>>)[0].value).toBeNull();
    expect((result.customFields as Array<Record<string, unknown>>)[0].redacted).toBe(true);
    expect((result.customFields as Array<Record<string, unknown>>)[1].value).toBe("https://portal.example");
    expect(result.redactions[0]?.reason).toBe("secret_field_type");
  });

  it("redacts Key/Serial labels and leaves configuration notes", () => {
    const result = applyItDocSecretPolicy({
      name: "Win 10 Ent",
      customFields: [{ columnName: "udf6text", label: "Key/Serial", fieldType: "TEXT", value: "not-a-product-key-format" }],
    });
    const rec = result as { customFields: Array<{ value: unknown }>; customFieldsRedaction: Array<{ reason: string }> };
    expect(rec.customFields[0]?.value).toBeNull();
    expect(rec.customFieldsRedaction[0]?.reason).toBe("secret_field_label");
  });
});
