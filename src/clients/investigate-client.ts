import type { SuperOpsClient } from "../superops/client.js";
import * as Q from "../superops/queries.js";
import { exclusiveStringIdentity, exactIs, pageClamp, sortBy } from "../superops/conditions.js";
import { listInfoInput, queryBoundedList } from "../superops/list-search.js";
import {
  asArray,
  asRecord,
  omitStructuredEmail,
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

  let sites: Record<string, unknown> | null = null;
  const siteList = await queryBoundedList(
    client,
    Q.GET_CLIENT_SITE_LIST,
    { clientId: resolved.accountId, listInfo: listInfoInput({ page: paging.page, pageSize: paging.pageSize }) },
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

  let assets: Record<string, unknown> | null = null;
  const clientName = typeof resolved.detail.name === "string" ? resolved.detail.name : "";
  const assetList = clientName
    ? await queryBoundedList(
        client,
        Q.GET_ASSET_LIST,
        listInfoInput({
          page: paging.page,
          pageSize: paging.pageSize,
          condition: exactIs("client.name", clientName),
          sort: [sortBy("lastCommunicatedTime", "DESC")],
        }),
        logicalOperations,
        "getAssetList"
      )
    : { ok: false as const, code: "malformed_input", message: "Client name missing", upstreamFailureCategory: "malformed_input" };
  if (assetList.ok) {
    const payload = asRecord(asRecord(assetList.data).getAssetList);
    const listInfo = asRecord(payload.listInfo);
    sections.assets = listInfo.hasMore === true ? "truncated" : "ok";
    assets = { items: asArray(payload.assets).map((item) => omitStructuredEmail(item)), listInfo, truncated: listInfo.hasMore === true };
  } else {
    errors.push({ code: "assets_unavailable", message: assetList.message });
  }

  let tickets: Record<string, unknown> | null = null;
  const ticketList = clientName
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
    : { ok: false as const, code: "malformed_input", message: "Client name missing", upstreamFailureCategory: "malformed_input" };
  if (ticketList.ok) {
    const payload = asRecord(asRecord(ticketList.data).getTicketList);
    const listInfo = asRecord(payload.listInfo);
    sections.tickets = listInfo.hasMore === true ? "truncated" : "ok";
    tickets = { items: asArray(payload.tickets).map((item) => omitStructuredEmail(item)), listInfo, truncated: listInfo.hasMore === true };
  } else {
    errors.push({ code: "tickets_unavailable", message: ticketList.message });
  }

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
      accountId: resolved.accountId,
      sections,
      truncated: {
        sites: sections.sites === "truncated",
        assets: sections.assets === "truncated",
        tickets: sections.tickets === "truncated",
      },
      logicalOperations,
      filterAttributes: clientName ? ["client.name"] : [],
    },
  };
}
