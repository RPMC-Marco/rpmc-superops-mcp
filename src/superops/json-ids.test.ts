import { describe, expect, it } from "vitest";
import { parseSuperOpsJson, quoteUnsafeJsonIntegers } from "./json-ids.js";

const LIVE_SITE_ACCOUNT_ID = "6623952408805568512";
const DOC_ASSET_ID = "9001114136934215681";

describe("quoteUnsafeJsonIntegers", () => {
  it("quotes SuperOps IDs larger than Number.MAX_SAFE_INTEGER", () => {
    expect(Number.isSafeInteger(Number(LIVE_SITE_ACCOUNT_ID))).toBe(false);
    expect(String(JSON.parse(LIVE_SITE_ACCOUNT_ID))).not.toBe(LIVE_SITE_ACCOUNT_ID);

    const raw = `{"client":{"accountId":${LIVE_SITE_ACCOUNT_ID},"name":"Acme"},"assetId":${DOC_ASSET_ID}}`;
    const parsed = parseSuperOpsJson(raw) as {
      client: { accountId: string; name: string };
      assetId: string;
    };
    expect(parsed.client.accountId).toBe(LIVE_SITE_ACCOUNT_ID);
    expect(parsed.assetId).toBe(DOC_ASSET_ID);
    expect(parsed.client.name).toBe("Acme");
  });

  it("does not rewrite IDs that are already JSON strings", () => {
    const raw = `{"accountId":"${LIVE_SITE_ACCOUNT_ID}"}`;
    expect(quoteUnsafeJsonIntegers(raw)).toBe(raw);
    expect((parseSuperOpsJson(raw) as { accountId: string }).accountId).toBe(LIVE_SITE_ACCOUNT_ID);
  });

  it("leaves Number.MAX_SAFE_INTEGER numeric and quotes the next integer", () => {
    const parsed = parseSuperOpsJson(
      `{"safe":9007199254740991,"unsafe":9007199254740993}`
    ) as { safe: number; unsafe: string };
    expect(parsed.safe).toBe(Number.MAX_SAFE_INTEGER);
    expect(typeof parsed.safe).toBe("number");
    expect(parsed.unsafe).toBe("9007199254740993");
    expect(typeof parsed.unsafe).toBe("string");
  });

  it("leaves pagination and health numbers numeric", () => {
    const raw = JSON.stringify({
      listInfo: { page: 1, pageSize: 25, hasMore: true, totalCount: 3628 },
      cpu: { physicalCore: 6, cpuUsage: { value: 2, unit: "%" } },
      memory: { totalMemory: 17179869184 },
    });
    const parsed = parseSuperOpsJson(raw) as {
      listInfo: { page: number; pageSize: number; totalCount: number };
      cpu: { physicalCore: number; cpuUsage: { value: number } };
      memory: { totalMemory: number };
    };
    expect(parsed.listInfo.page).toBe(1);
    expect(parsed.listInfo.pageSize).toBe(25);
    expect(parsed.listInfo.totalCount).toBe(3628);
    expect(typeof parsed.listInfo.page).toBe("number");
    expect(parsed.cpu.physicalCore).toBe(6);
    expect(parsed.cpu.cpuUsage.value).toBe(2);
    expect(parsed.memory.totalMemory).toBe(17179869184);
    expect(typeof parsed.memory.totalMemory).toBe("number");
  });

  it("does not rewrite floats or exponent numbers", () => {
    const raw = `{"ratio":1.5,"tiny":1e-7,"bigFloat":1.2345678901234567e20}`;
    const parsed = parseSuperOpsJson(raw) as { ratio: number; tiny: number; bigFloat: number };
    expect(parsed.ratio).toBe(1.5);
    expect(parsed.tiny).toBe(1e-7);
    expect(typeof parsed.bigFloat).toBe("number");
  });

  it("does not rewrite 16-digit-looking text inside strings", () => {
    const raw = `{"message":"id ${LIVE_SITE_ACCOUNT_ID} in body"}`;
    const parsed = parseSuperOpsJson(raw) as { message: string };
    expect(parsed.message).toBe(`id ${LIVE_SITE_ACCOUNT_ID} in body`);
  });
});
