/**
 * Explicit `assetId` is a SuperOps GraphQL ID scalar (`AssetIdentifierInput.assetId: ID!`).
 *
 * Official docs do not guarantee digits or a minimum length. Examples are often long
 * numeric strings, but that is not a schema contract. Human identifiers (hostName, name,
 * serialNumber) are separate public fields, so assetId is not disambiguated by format.
 *
 * Reject only empty values and values that contain whitespace (not a usable ID).
 * Opaque getAsset failures remain lookup_failed / unavailable, never not_found.
 */

export function parseAssetId(raw: unknown): { ok: true; value: string } | { ok: false; code: "malformed_input"; message: string } {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    return { ok: false, code: "malformed_input", message: "assetId is required" };
  }
  if (/\s/.test(value)) {
    return {
      ok: false,
      code: "malformed_input",
      message: "assetId must be a SuperOps GraphQL ID without whitespace; use hostName, name, or serialNumber for human identifiers",
    };
  }
  return { ok: true, value };
}
