import { describe, expect, it } from "vitest";
import { accountIdFrom, pinItemsToAccountId, scalarId } from "./common.js";

const LIVE_ID = "6623952408805568512";

describe("scalarId", () => {
  it("keeps string IDs exact, including values above MAX_SAFE_INTEGER", () => {
    expect(scalarId(LIVE_ID)).toBe(LIVE_ID);
    expect(LIVE_ID === String(Number(LIVE_ID))).toBe(false);
  });

  it("stringifies safe integer IDs losslessly", () => {
    expect(scalarId(4)).toBe("4");
    expect(scalarId(9007199254740991)).toBe("9007199254740991");
  });

  it("refuses already-rounded unsafe numbers rather than correlating on them", () => {
    const rounded = Number(LIVE_ID);
    expect(Number.isSafeInteger(rounded)).toBe(false);
    expect(scalarId(rounded)).toBeUndefined();
  });
});

describe("pinItemsToAccountId", () => {
  it("matches exact string accountIds and does not treat a rounded number as the same client", () => {
    const items = [
      { assetId: "ours", client: { accountId: LIVE_ID, name: "Acme" } },
      { assetId: "numeric-safe", client: { accountId: 4, name: "Acme" } },
      { assetId: "rounded", client: { accountId: Number(LIVE_ID), name: "Acme" } },
    ];
    const pinned = pinItemsToAccountId(items, LIVE_ID);
    expect(pinned.kept).toHaveLength(1);
    expect((pinned.kept[0] as { assetId: string }).assetId).toBe("ours");
    expect(pinned.dropped).toBe(2);
    expect(accountIdFrom({ accountId: LIVE_ID })).toBe(LIVE_ID);
    expect(accountIdFrom({ accountId: Number(LIVE_ID) })).toBeUndefined();
  });
});
