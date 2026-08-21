/**
 * Asset identifier classification.
 *
 * Official SuperOps `getAsset` requires `AssetIdentifierInput.assetId`.
 * Asset `name`, `hostName`, and `serialNumber` are documented response fields
 * but are NOT documented as ListInfoInput filter attributes. This classifier
 * therefore does not treat those as lookup keys.
 */

export type AssetRefKind = "assetId" | "unsupported_human" | "malformed";

export type AssetRef = { kind: AssetRefKind; value: string };

/** Official examples use long numeric IDs; GraphQL type is ID (string). */
export const ASSET_ID_PATTERN = /^\d{8,}$/;

export function classifyAssetRef(raw: unknown): AssetRef {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    return { kind: "malformed", value: "" };
  }
  if (ASSET_ID_PATTERN.test(value)) {
    return { kind: "assetId", value };
  }
  return { kind: "unsupported_human", value };
}
