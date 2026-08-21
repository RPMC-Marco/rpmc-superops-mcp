import type { SuperOpsClient } from "../superops/client.js";
import * as Q from "../superops/queries.js";
import { exclusiveStringIdentity, exactIs, pageClamp, sortBy } from "../superops/conditions.js";
import { listInfoInput, queryBoundedList, queryGetAssetList } from "../superops/list-search.js";
import {
  asArray,
  asRecord,
  omitStructuredEmail,
  pinItemsToAccountId,
  type InvestigateNotice,
  type InvestigateStatus,
} from "../investigate/common.js";
import { resolveClient } from "./resolve-client.js";

function failed(input: {
  code: string;
  message: string;
  classifiedAs: string;
  logicalOperations: string[];
  candidates?: Array<Record<string, unknown>>;
  upstreamFailureCategory?: string;
}): Record<string, unknown> {
  return {
    status: "failed" as InvestigateStatus,
    code: input.code,
    message: input.message,
    candidates: input.candidates,
    warnings: [],
    errors: [{ code: input.code, message: input.message }],
    provenance: {
      classifiedAs: input.classifiedAs,
      resolution: "unresolved",
      sections: { client: "failed", sites: "failed", assets: "failed", tickets: "failed", alerts: "not_requested" },
      logicalOperations: input.logicalOperations,
      upstreamFailureCategory: input.upstreamFailureCategory ?? input.code,
    },
  };
}

export async function investigateClient(
  args: Record<string, unknown>,
  client: SuperOpsClient
): Promise<Record<string, unknown>> {
  const identity = exclusiveStringIdentity(args, ["accountId", "name", "emailDomain"]);
  if (!identity.ok) {
    return failed({
      code: identity.code,
      message: identity.message,
      classifiedAs: "malformed",
      logicalOperations: [],
    });
  }

  const resolved = await resolveClient(client, identity);
  if (!resolved.ok) {
    return failed({
      code: resolved.code,
      message: resolved.message,
      classifiedAs: identity.key,
      logicalOperations: resolved.logicalOperations,
      candidates: resolved.candidates,
      upstreamFailureCategory: resolved.upstreamFailureCategory,
    });
  }

  const logicalOperations = [...resolved.logicalOperations];
  const accountId = resolved.accountId;
  const clientName = typeof resolved.detail.name === "string" ? resolved.detail.name : "";
  const warnings: InvestigateNotice[] = [];
  const errors: InvestigateNotice[] = [];
  const sections = {
    client: "ok" as const,
    sites: "failed" as "ok" | "failed" | "truncated",
    assets: "failed" as "ok" | "failed" | "truncated",
    tickets: "failed" as "ok" | "failed" | "truncated",
    alerts: "not_requested" as const,
  };
  const paging = pageClamp(1, 25);

  function attachPinnedPage(
    listed: { ok: true; data: unknown } | { ok: false; message: string },
    listKey: "getAssetList" | "getTicketList",
    itemsKey: "assets" | "tickets",
    section: "assets" | "tickets",
    unavailableCode: string
  ): Record<string, unknown> | null {
    if (!listed.ok) {
      errors.push({ code: unavailableCode, message: listed.message });
      return null;
    }
    const payload = asRecord(asRecord(listed.data)[listKey]);
    const listInfo = asRecord(payload.listInfo);
    const pinned = pinItemsToAccountId(asArray(payload[itemsKey]), accountId);
    if (pinned.dropped > 0) {
      warnings.push({
        code: "client_name_not_unique",
        message:
          "Some name-matched rows belonged to another client or lacked client.accountId and were omitted. SuperOps documents client.name as the ticket/asset client filter, not accountId.",
      });
    }
    const truncated = listInfo.hasMore === true || pinned.dropped > 0;
    sections[section] = truncated ? "truncated" : "ok";
    return {
      items: pinned.kept.map(omitStructuredEmail),
      listInfo,
      truncated,
      droppedForeign: pinned.dropped,
    };
  }

  let sites: Record<string, unknown> | null = null;
  const siteList = await queryBoundedList(
    client,
    Q.GET_CLIENT_SITE_LIST,
    { clientId: accountId, listInfo: listInfoInput({ page: paging.page, pageSize: paging.pageSize }) },
    logicalOperations,
    "getClientSiteList"
  );
  if (siteList.ok) {
    const payload = asRecord(asRecord(siteList.data).getClientSiteList);
    const items = asArray(payload.sites).map((item) => omitStructuredEmail(item));
    const listInfo = asRecord(payload.listInfo);
    sections.sites = listInfo.hasMore === true ? "truncated" : "ok";
    sites = { items, listInfo, truncated: listInfo.hasMore === true };
  } else {
    errors.push({ code: "sites_unavailable", message: siteList.message });
  }

  const assets = attachPinnedPage(
    clientName
      ? await queryGetAssetList(
          client,
          {
            page: paging.page,
            pageSize: paging.pageSize,
            condition: exactIs("client.name", clientName),
          },
          logicalOperations
        )
      : { ok: false as const, message: "Client name missing" },
    "getAssetList",
    "assets",
    "assets",
    "assets_unavailable"
  );

  const tickets = attachPinnedPage(
    clientName
      ? await queryBoundedList(
          client,
          Q.GET_TICKET_LIST,
          listInfoInput({
            page: paging.page,
            pageSize: paging.pageSize,
            condition: exactIs("client.name", clientName),
            sort: [sortBy("createdTime", "DESC")],
          }),
          logicalOperations,
          "getTicketList"
        )
      : { ok: false as const, message: "Client name missing" },
    "getTicketList",
    "tickets",
    "tickets",
    "tickets_unavailable"
  );

  const supportingFailed = [sections.sites, sections.assets, sections.tickets].some((section) => section === "failed");
  return {
    status: (supportingFailed ? "partial" : "complete") as InvestigateStatus,
    client: omitStructuredEmail(resolved.detail),
    sites,
    assets,
    tickets,
    alerts: { status: "not_requested", reason: "Alert type has no documented client filter; use superops_alerts_search or investigate_asset" },
    warnings,
    errors,
    provenance: {
      supplied: { [identity.key]: identity.value },
      classifiedAs: identity.key,
      resolution: resolved.method,
      accountId,
      sections,
      truncated: {
        sites: sections.sites === "truncated",
        assets: sections.assets === "truncated",
        tickets: sections.tickets === "truncated",
      },
      logicalOperations,
      filterAttributes: clientName ? ["client.name"] : [],
      sortAttribute: null,
      clientScope: {
        sites: "clientId",
        assetsTickets: "client.name locally pinned to accountId",
      },
    },
  };
}
