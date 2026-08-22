import { z } from "zod";
import type { Capability } from "./capabilities.js";

const grantToken = z.string().min(1);

export const AUTHORIZATION_CAPABILITIES: Capability[] = [
  {
    name: "rpmc_authorization_request_grant",
    description:
      "Request a scoped Rules B (maintenance_window) or Rules C (authorized_build) authorization grant. Rules A is the default and does not use a grant. The model cannot self-select B/C: this tool always presents one human elicitation describing profile, task, scope, maximum consequence, targets, exclusions, and expiry. After the human confirms, the server returns an opaque HMAC-signed grant for later write tools via authorizationGrant. The grant cannot raise classification, expand scope, or be forged. Out-of-scope actions remain unauthorized even under Rules C.",
    classification: "write_low",
    operationKind: "local",
    phase1Registered: false,
    phase2Registered: true,
    inputSchema: z.object({
      profile: z.string().min(1),
      task: z.string().min(1),
      ticket: z.string().optional(),
      clientAccountId: z.string().optional(),
      targets: z
        .array(
          z.object({
            type: z.enum(["asset", "ticket", "alert", "client", "site", "workItem"]),
            id: z.string().min(1),
            label: z.string().optional(),
          })
        )
        .optional(),
      exclusions: z
        .array(
          z.object({
            type: z.string().min(1),
            id: z.string().min(1),
          })
        )
        .optional(),
      expiresInMinutes: z.number().int().positive().optional(),
      terminateOnTicketResolved: z.boolean().optional(),
    }),
  },
  {
    name: "rpmc_authorization_inspect_grant",
    description:
      "Inspect a previously human-created authorization grant. Returns profile, scope, expiry, and termination claims. Does not return the raw grant token and does not execute SuperOps mutations.",
    classification: "read",
    operationKind: "local",
    phase1Registered: false,
    phase2Registered: true,
    inputSchema: z.object({
      authorizationGrant: grantToken,
    }),
  },
  {
    name: "rpmc_authorization_revoke_grant",
    description:
      "Revoke a previously human-created authorization grant for this server process. Requires the opaque grant token. Restart also invalidates all grants.",
    classification: "write_low",
    operationKind: "local",
    phase1Registered: false,
    phase2Registered: true,
    inputSchema: z.object({
      authorizationGrant: grantToken,
    }),
  },
];
