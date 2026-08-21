import type { SuperOpsClient } from "../superops/client.js";
import * as Q from "../superops/queries.js";
import { exactIs, pageClamp, stringArg } from "../superops/conditions.js";
import { listInfoInput, queryBoundedList } from "../superops/list-search.js";
import { asArray, asRecord, failureCode, omitStructuredEmail, upstreamFailureCategory, type InvestigateStatus } from "../investigate/common.js";
import { toClientSafeError } from "../privacy/errors.js";

export async function getSite(args: Record<string, unknown>, client: SuperOpsClient): Promise<Record<string, unknown>> {
  const id = stringArg(args.siteId ?? args.id);
  if (!id) {
    return {
      status: "failed" as InvestigateStatus,
      code: "malformed_input",
      message: "siteId is required",
      site: null,
      provenance: { query: "getClientSite", logicalOperations: [] },
    };
  }
  try {
    const data = asRecord(await client.query(Q.GET_CLIENT_SITE, { input: { id } }));
    const site = omitStructuredEmail(asRecord(data.getClientSite ?? data));
    return {
      status: "complete" as InvestigateStatus,
      site,
      provenance: { query: "getClientSite", resolution: "siteId_direct", logicalOperations: ["getClientSite"] },
    };
  } catch (error) {
    return {
      status: "failed" as InvestigateStatus,
      code: failureCode(error),
      message: toClientSafeError(error),
      site: null,
      provenance: {
        query: "getClientSite",
        resolution: "siteId_direct",
        logicalOperations: ["getClientSite"],
        upstreamFailureCategory: upstreamFailureCategory(error),
      },
    };
  }
}

export async function searchSites(args: Record<string, unknown>, client: SuperOpsClient): Promise<Record<string, unknown>> {
  const logicalOperations: string[] = [];
  const paging = pageClamp(args.page, args.pageSize);
  const name = stringArg(args.name);
  const clientId = stringArg(args.clientId ?? args.accountId);
  const condition = name ? exactIs("name", name) : undefined;
  if (!name && !clientId) {
    return {
      status: "failed" as InvestigateStatus,
      code: "malformed_input",
      message: "superops_sites_search requires name and/or clientId; use superops_sites_list for an unfiltered page",
      items: [],
      provenance: { query: "getClientSiteList", tenantScan: false, logicalOperations },
    };
  }
  const input: Record<string, unknown> = {
    listInfo: listInfoInput({ page: paging.page, pageSize: paging.pageSize, condition }),
  };
  if (clientId) input.clientId = clientId;
  const listed = await queryBoundedList(client, Q.GET_CLIENT_SITE_LIST, input, logicalOperations, "getClientSiteList");
  if (!listed.ok) {
    return {
      status: "failed" as InvestigateStatus,
      code: listed.code,
      message: listed.message,
      items: [],
      provenance: {
        query: "getClientSiteList",
        tenantScan: false,
        filterAttributes: condition ? ["name"] : [],
        logicalOperations,
        upstreamFailureCategory: listed.upstreamFailureCategory,
      },
    };
  }
  const payload = asRecord(asRecord(listed.data).getClientSiteList);
  return {
    status: "complete" as InvestigateStatus,
    items: asArray(payload.sites).map((item) => omitStructuredEmail(item)),
    listInfo: payload.listInfo,
    provenance: {
      query: "getClientSiteList",
      tenantScan: false,
      resolution: clientId ? "clientId_and_optional_name" : "name_condition_is",
      filterAttributes: condition ? ["name"] : [],
      logicalOperations,
      rpmcLiveConfirmed: true,
    },
  };
}

export async function listSites(args: Record<string, unknown>, client: SuperOpsClient): Promise<unknown> {
  const paging = pageClamp(args.page, args.pageSize, 25, 100);
  const clientId = stringArg(args.clientId ?? args.accountId);
  const input: Record<string, unknown> = {
    listInfo: listInfoInput({ page: paging.page, pageSize: paging.pageSize }),
  };
  if (clientId) input.clientId = clientId;
  return client.query(Q.GET_CLIENT_SITE_LIST, { input });
}
