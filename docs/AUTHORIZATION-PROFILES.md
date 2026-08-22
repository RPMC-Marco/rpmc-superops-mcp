# Authorization profiles (Rules A / B / C)

This document is the canonical RPMC authorization-profile model for Phase 2.

Consequence classification and authorization are separate:

- **Classification** answers: what effect can this action have?
- **Authorization** answers: has a human already authorized this consequence for this scoped task/run?

An action’s true classification is never rewritten because a higher profile is in effect. A reboot remains `disruptive` under Rules B and Rules C. Audit records the effective runtime classification.

There is no global unsafe mode and no tool argument such as `safety=false`, `ignoreSafety=true`, `force=true`, `confirmed=true`, or `userApproved=true`.

## Consequence classes

| Class | Meaning | Typical examples |
|---|---|---|
| `read` | No state change | inventory, ticket/asset investigation |
| `write_low` | Internal / non-disruptive technician work | private notes, worklogs, routine tasks, disposable temp/cache cleanup |
| `write_visible` | Visible administrative/customer/workflow change that does **not** interrupt a system | public reply, assignment, status, priority, Resolved, explicit Closed, create ticket, **resolve alert**, normal asset/user metadata |
| `disruptive` | May interrupt normal use or service | reboot, restart a production service, log off a user, stop a process, interrupt networking |
| `destructive` | Material, difficult-to-reverse, or irreversible loss of valuable data, configuration, identity, recovery capability, or meaningful system state | delete a user profile, destroy backups/recovery data, wipe/repartition a machine with meaningful state, overwrite unique configuration, reset an identity |

### Destructive is based on consequence, not verb

Do **not** classify an action as destructive merely because it deletes, removes, clears, uninstalls, overwrites, or wipes.

- Delete temporary files, clear DNS cache, or remove a regeneratable application cache → normally `write_low`
- Clear a cache that requires restarting an application → usually `disruptive`
- Uninstall/reinstall a recoverable application while users depend on it → `disruptive` if availability is interrupted
- Delete a user profile, production/business files, unique configuration, backups, or recovery data → `destructive`

An action can be destructive without a delete verb (format storage, overwrite unique configuration, destroy recovery state). When genuinely uncertain, classify upward. The model cannot lower classification.

## Ticket Resolved vs Closed

RPMC business distinction:

- **Resolved** = the technician believes the issue is solved. The ticket is ready for management review. Delegated “handle this ticket” work may set Resolved when evidence supports it.
- **Closed** = management review is complete and support has concluded. The AI must **not** independently take Resolved → Closed merely because troubleshooting finished.

If the human explicitly says “Close ticket 1234”, Closed is authorized. Closed is `write_visible`, not disruptive or destructive. This is a workflow-authority rule.

`superops_tickets_update` / `superops_tickets_create` require `lifecycle=close` when the status name is clearly Closed-class (`\bclosed\b`). Unknown custom SuperOps status names are not blocked.

## Profiles

### Rules A — Standard Technician

Default. No grant is required for ordinary read / `write_low` / `write_visible` work.

| Class | Authorization |
|---|---|
| read / write_low / write_visible | autonomous within a delegated task |
| disruptive | human confirmation immediately before execution |
| destructive | warning/details + human confirmation immediately before execution |

Example: “Handle ticket 1234.” The AI may investigate, communicate, add notes/worklogs, change assignment/status/priority, resolve appropriate alerts, and mark the ticket Resolved. A reboot stops for confirmation, then the same delegated workflow continues.

### Rules B — Maintenance Window

For after-hours/weekend/holiday maintenance after a **human-created** scoped grant.

| Class | Authorization inside scope |
|---|---|
| read / write_low / write_visible | autonomous |
| disruptive | pre-authorized for this scoped run |
| destructive | still requires per-action warning + confirmation |

The action still audits as `disruptive`. Rules B does not make disruptive actions `write_low`.

### Rules C — Authorized Build / Change

For new server/PC/VM builds, isolated environments, and approved migrations/change windows, after a **human-created** scoped grant. The intended end state of the **authorized targets** matters more than preserving their current state.

| Class | Authorization inside scope |
|---|---|
| read / write_low / write_visible / disruptive / destructive | pre-authorized |

Rules C is **not** “do anything.” Destructive operations are permitted only inside the human-authorized scope. Scope-breaking actions are refused (not silently expanded): other clients, Hyper-V hosts not in the grant, shared storage, unrelated production servers, backups, unrelated firewall/AD/DNS, and tenant-wide expansion.

A destructive in-scope action under Rules C remains classified `destructive` in audit.

## Scoped grant architecture

Rules B and C cannot be selected by an AI-controlled `profile` argument on a write tool.

1. Human: “Handle ticket 1234 under Rules B.”
2. The AI calls `rpmc_authorization_request_grant` with a proposed profile, task, and explicit targets.
3. MCP presents **one** human elicitation describing profile, task, scope, maximum consequence, targets, exclusions, and expiry.
4. After the human confirms (typed target + acknowledged B/C), the server mints an HMAC-signed opaque grant from existing process credentials (no new long-lived secret).
5. Later writes pass `authorizationGrant`. In-scope consequences already authorized by the profile proceed without repeated elicitation.

The model may carry the opaque token. It cannot forge it, change profile/scope/target/consequence ceiling/expiry, or reuse it for another task/client/asset. Tampering invalidates the HMAC.

Grants are process-ephemeral: they are tracked in memory, expire, may terminate when the authorized ticket reaches Resolved/Closed, can be revoked with `rpmc_authorization_revoke_grant`, and die on server restart.

Default TTL: Rules B 8 hours (cap 24), Rules C 12 hours (cap 72).

## Audit

Write audit records:

- `classification` / `effectiveClassification` = runtime consequence
- `registeredClassification` = static MCP capability class
- `authorizationProfile`, `authorizationSource`, `authorizationGrantPresent`, `scopeCheck`, `authorizationResult`

Raw grant tokens, HMAC material, and secrets are not logged.

## Future requirements (not in this release)

### Autonomous ticket handling (end goal)

Human: “Handle ticket 1234.” The AI technician may eventually read the ticket, inspect client/site/user/asset, communicate, update state, run authorized diagnostics, remediate, verify, and move the ticket to Resolved without asking about every routine action. Only consequence/authorization boundaries interrupt the run. Closed remains an explicit operator/management instruction. This release builds the authorization foundation; it does not implement a full orchestration agent.

### Ad-hoc terminal / command execution

The SuperOps GUI has interactive CMD/PowerShell, but the current public API path is `runScriptOnAsset`. If RPMC later builds a controlled ad-hoc command runner, authorization must classify the **actual command/effect**, not the wrapper script’s name. The same Rules A/B/C grant architecture should be reused. Do not trust verbs such as `Remove-Item`, `del`, `rm`, `Clear-*`, or `Uninstall-*` as automatic `destructive`.

Rules B/C have **not** been live-confirmed. See [PHASE2-LIVE-VALIDATION.md](PHASE2-LIVE-VALIDATION.md).
