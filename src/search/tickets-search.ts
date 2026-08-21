import type { SuperOpsClient } from "../superops/client.js";
import * as Q from "../superops/queries.js";
import {
  and,
  conditionAttributes,
  exactIs,
  hasAnyFilter,
  includesValues,
  inLastDays,
  isDatePreset,
  onPlaceholder,
  pageClamp,
  sortBy,
  stringArg,
  stringList,
} from "../superops/conditions.js";
import { listInfoInput, queryBoundedList } from "../superops/list-search.js";
import { asArray, asRecord, omitStructuredEmail, type InvestigateStatus } from "../investigate/common.js";

const FILTER_KEYS = [
  "displayId",
  "status",
  "clientName",
  "siteName",
  "technicianName",
  "techGroupName",
  "priority",
  "created",
  "updated",
  "createdInLastDays",
];

function searchFailed(input: {
  code: string;
  message: string;
  logicalOperations: string[];
  filterAttributes?: string[];
  upstreamFailureCategory?: string;
}): Record<string, unknown> {
  return {
    status: "failed" as InvestigateStatus,
    code: input.code,
    message: input.message,
    items: [],
    provenance: {
      query: "getTicketList",
      tenantScan: false,
      resolution: "unresolved",
      filterAttributes: input.filterAttributes ?? [],
      logicalOperations: input.logicalOperations,
      upstreamFailureCategory: input.upstreamFailureCategory ?? input.code,
    },
  };
}

export async function searchTickets(args: Record<string, unknown>, client: SuperOpsClient): Promise<Record<string, unknown>> {
  const logicalOperations: string[] = [];
  if (!hasAnyFilter(args, FILTER_KEYS)) {
    return searchFailed({
      code: "malformed_input",
      message: "superops_tickets_search requires at least one explicit filter; use superops_tickets_list for an unfiltered page",
      logicalOperations,
    });
  }

  const operands = [];
  const displayId = stringArg(args.displayId);
  if (displayId) operands.push(exactIs("displayId", displayId));
  const statuses = stringList(args.status);
  if (statuses.length) operands.push(includesValues("status", statuses));
  const clientName = stringArg(args.clientName);
  if (clientName) operands.push(exactIs("client.name", clientName));
  const siteName = stringArg(args.siteName);
  if (siteName) operands.push(exactIs("site.name", siteName));
  const technicianName = stringArg(args.technicianName);
  if (technicianName) operands.push(exactIs("technician.name", technicianName));
  const techGroupName = stringArg(args.techGroupName);
  if (techGroupName) operands.push(exactIs("techGroup.name", techGroupName));
  const priority = stringArg(args.priority);
  if (priority) operands.push(exactIs("priority", priority));
  if (isDatePreset(args.created)) operands.push(onPlaceholder("createdTime", args.created));
  if (isDatePreset(args.updated)) operands.push(onPlaceholder("updatedTime", args.updated));
  if (typeof args.createdInLastDays === "number" && args.createdInLastDays >= 1 && args.createdInLastDays <= 31) {
    operands.push(inLastDays("createdTime", Math.floor(args.createdInLastDays)));
  } else if (args.createdInLastDays != null && args.createdInLastDays !== "") {
    return searchFailed({
      code: "malformed_input",
      message: "createdInLastDays must be an integer from 1 to 31",
      logicalOperations,
    });
  }

  const condition = and(operands);
  const filterAttributes = conditionAttributes(condition);
  const sortAttribute = stringArg(args.sortBy) === "updatedTime" ? "updatedTime" : "createdTime";
  const sortOrder = stringArg(args.sortOrder) === "ASC" ? "ASC" : "DESC";
  const paging = pageClamp(args.page, args.pageSize);

  const listed = await queryBoundedList(
    client,
    Q.GET_TICKET_LIST,
    listInfoInput({
      page: paging.page,
      pageSize: paging.pageSize,
      condition,
      sort: [sortBy(sortAttribute, sortOrder)],
    }),
    logicalOperations,
    "getTicketList"
  );

  if (!listed.ok && listed.code === "unsupported_filter") {
    const retry = await queryBoundedList(
      client,
      Q.GET_TICKET_LIST,
      listInfoInput({ page: paging.page, pageSize: paging.pageSize, condition }),
      logicalOperations,
      "getTicketList"
    );
    if (!retry.ok) {
      return searchFailed({
        code: retry.code,
        message: retry.message,
        logicalOperations,
        filterAttributes,
        upstreamFailureCategory: retry.upstreamFailureCategory,
      });
    }
    const payload = asRecord(asRecord(retry.data).getTicketList);
    return {
      status: "complete" as InvestigateStatus,
      items: asArray(payload.tickets).map((item) => omitStructuredEmail(item)),
      listInfo: payload.listInfo,
      warnings: [{ code: "sort_unconfirmed", message: "Server-side sort was rejected; results use SuperOps default order" }],
      provenance: {
        query: "getTicketList",
        tenantScan: false,
        resolution: "condition_without_sort",
        filterAttributes,
        sortAttribute: null,
        logicalOperations,
        rpmcLiveConfirmed: filterAttributes.length === 1 && filterAttributes[0] === "displayId",
      },
    };
  }

  if (!listed.ok) {
    return searchFailed({
      code: listed.code,
      message: listed.message,
      logicalOperations,
      filterAttributes,
      upstreamFailureCategory: listed.upstreamFailureCategory,
    });
  }

  const payload = asRecord(asRecord(listed.data).getTicketList);
  const items = asArray(payload.tickets).map((item) => omitStructuredEmail(item));
  return {
    status: "complete" as InvestigateStatus,
    items,
    listInfo: payload.listInfo,
    warnings: [],
    provenance: {
      query: "getTicketList",
      tenantScan: false,
      resolution: "condition_and_sort",
      filterAttributes,
      sortAttribute,
      logicalOperations,
      rpmcLiveConfirmed: filterAttributes.length === 1 && filterAttributes[0] === "displayId",
    },
  };
}
