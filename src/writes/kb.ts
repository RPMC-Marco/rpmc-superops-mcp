/**
 * Live RPMC createKbArticle contract (0.2.2 probe): SuperOps ISE'd on
 * fragment HTML with loginRequired=false. Official HTML document +
 * loginRequired=true + technician AllUsers/AllGroups succeeded.
 */

export function kbArticleHtml(content: string): string {
  const trimmed = content.trim();
  if (/<html[\s>]/i.test(trimmed)) return trimmed;
  return `<html><body>${trimmed}</body></html>`;
}

export function kbLoginRequired(value: unknown): boolean {
  return value !== false;
}

export function kbVisibility(kind: "technicians" | "requesters" | undefined): Record<string, unknown> {
  if (kind === "requesters") {
    return {
      added: [
        {
          portalType: "REQUESTER",
          clientSharedType: "AllClients",
          siteSharedType: "AllSites",
          userRoleSharedType: "AllRoles",
        },
      ],
    };
  }
  return {
    added: [{ portalType: "TECHNICIAN", userSharedType: "AllUsers", groupSharedType: "AllGroups" }],
  };
}
