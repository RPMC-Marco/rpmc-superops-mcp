# Phase 2 controlled live mutation validation plan

**Do not run this plan during engineering.** Live mutations are a later, slower milestone.

No live SuperOps writes were performed for 0.2.0 or 0.2.1 engineering.

Authorization profiles (Rules A/B/C) are documented in [AUTHORIZATION-PROFILES.md](AUTHORIZATION-PROFILES.md). They are **not** live-confirmed until this plan is executed.

## Principles

- Test by consequence and reversibility, not randomly.
- Prefer: create TEST object → verify → modify → verify → undo/close → verify cleanup.
- If cleanup fails: **STOP that mutation class**.
- Use explicit `TEST` naming (`TEST MCP 0.2.1 …`) and a dedicated test client/site where possible.
- Never use production customer-visible content except on a designated TEST ticket.
- One class at a time. Do not batch unrelated production writes.
- After each write: confirm `rpmc_status` still reports the same version/SHA; confirm audit lines have no ticket bodies/secrets.

## Test data strategy

- Tickets: displayId recorded after create; subject prefix `TEST MCP`.
- Assets: use a non-production lab endpoint if available; otherwise a disposable workstation with owner approval.
- Alerts: create TEST alert on the lab asset, then resolve that same alert.
- IT docs: use a non-secret category (no PASSWORD/SECURE_TEXT).
- KB: DRAFT + technician visibility only.
- Scripts: start with a known diagnostic/inventory script; disruptive scripts only after diagnostics pass and a human is at the console.

## Ordered test groups

### 1. Low-consequence / reversible technician writes

1. `superops_tickets_add_note` PRIVATE on a TEST ticket (create the ticket first if needed).
2. `superops_worklogs_create` on that ticket with qty `0.1` and notes `TEST MCP`.
3. `superops_worklogs_update` change notes only.
4. `superops_tasks_create` module TICKET on the TEST ticket.

**Verify:** note list contains the note; worklog `itemId` exists; task `get` matches title/status.  
**Cleanup:** close/update ticket later; leave worklog/task as TEST artifacts if SuperOps cannot delete them.  
**Stop if:** duplicate notes appear from a single retry, or technician identity is not the API token user.

### 2. Customer-visible ticket workflow

1. `superops_tickets_create` with `TEST MCP` subject, known test client, `INTEGRATION` source.
2. Optional: same create with `alertId` + `assetId` from a lab alert/asset.
3. `superops_tickets_update` assign technician/group, then status/priority.
4. `superops_tickets_add_conversation` with `sendMail=false`.
5. Set status to **Resolved** (no extra confirmation). Do **not** Close unless the operator explicitly instructs close (`lifecycle=close`).

**Verify:** `getTicket` and conversation list. Retry the same `requestId` and confirm no second ticket.  
**Cleanup:** close the TEST ticket.  
**Stop if:** a second ticket is created, or asset association is claimed on update (it is unsupported).

### 3. Worklogs / tasks (if group 1 passed)

Re-check create+update on the same TEST ticket. Confirm `requestId` replay returns `idempotentReplay=true` without a second SuperOps create.

### 4. Client-user / asset updates

1. `superops_client_users_update` contactNumber on a **test** requester, then restore.
2. `superops_client_users_update_association` site change on a test association, then restore.
3. `superops_assets_update` warrantyExpiryDate or name on a lab asset, then restore.

**Stop if:** email/login changed (should be impossible), or another client's asset is updated.

### 5. IT documentation (non-secret)

1. `superops_itdocs_create` in a non-secret category with name `TEST MCP`.
2. `superops_itdocs_update` rename, then restore.
3. Negative: attempt a PASSWORD/license field and confirm local refusal (no SuperOps call).

**Stop if:** a secret field is accepted.

### 6. Alert operations

1. `superops_alerts_create` on the lab asset (`TEST MCP` message).
2. Verify via `getAlertsForAsset`.
3. `superops_alerts_resolve` for that new alert id — **must proceed without disruptive elicitation** (`write_visible`).
4. Verify resolved or gone.

**Stop if:** an unrelated alert is resolved, or the tool unexpectedly demands disruptive confirmation.

### 7. Higher-consequence endpoint / script actions

1. `superops_scripts_list` to pick a known diagnostic script.
2. Confirm classifier reports `write_low` for that script.
3. `superops_scripts_execute` on the lab asset.
4. Verify `actionConfigId` and that the endpoint was not disrupted.

### 8. Disruptive script actions

1. Choose a reboot/restart script only with a human at the console.
2. Classifier must be `disruptive` (or higher).
3. Elicitation must name the hostname and expected interruption.
4. Execute only after typed-target confirmation.
5. Confirm the endpoint rebooted as expected and recovered.

**Stop if:** confirmation can be satisfied by a tool argument, or an unclassified script runs as `write_low`.

### 9. Destructive behavior

No approved Phase 2 hard-delete tools. Do **not** test `softDelete*` / recycle / user deletion.  
If a script classifies `destructive`, treat it as the last test on a disposable lab object only, with the full warning text, then stop the class after one success.

### 10. Rules A ordinary writes

Repeat a PRIVATE note + ticket status/priority change on the TEST ticket. Confirm no elicitation and audit `effectiveClassification` is `write_low` / `write_visible`.

### 11. Rules A disruptive elicitation

On a lab endpoint, run a classified-disruptive script with no grant. Confirm one genuine elicitation. Confirm `profile=C` / `confirmed=true` tool arguments do not bypass it.

### 12. Rules B grant (lab only)

1. Human: request a Rules B grant for the TEST ticket and the **lab** asset only (`rpmc_authorization_request_grant`).
2. Confirm **one** elicitation describing profile, task, targets, max consequence, expiry.
3. Execute one disruptive script under the grant.
4. Execute a **second** disruptive script on the same asset under the same valid grant — no second prompt.
5. Verify audit: `effectiveClassification=disruptive`, `authorizationProfile=maintenance_window`, `authorizationResult=preauthorized_by_scoped_grant`, no raw grant token.
6. Attempt a classified-destructive script under the same Rules B grant — **must still stop/confirm**.

### 13. Rules C on a disposable/lab target only

Do **not** test Rules C against production customer infrastructure.

1. Human grant for one disposable lab asset (Rules C).
2. Disruptive action in scope — proceeds; audit still `disruptive`.
3. Destructive action in scope on that lab object only — proceeds; audit still `destructive`.
4. Attempt an out-of-scope destructive/disruptive action (different asset/host) — **must refuse** (`scope_violation`).

### 14. Ticket Closed authority

On the TEST ticket, attempt `status=Closed` without `lifecycle=close` — must refuse. After an explicit operator close instruction, `lifecycle=close` may close it (`write_visible`, not disruptive).

## Verification checklist (every group)

- Mutation result `outcome` is `complete` only when post-write read agrees.
- Audit line has tool, **effective** classification, registered classification, target type, authorization profile/source/result, verification result; no bodies/passwords/tokens/grant tokens.
- Phase 1 reads still work (`investigate_ticket` / `rpmc_status`).
- No generic GraphQL mutation tool appears.
- Rules B/C never rewrite classification.

## Global stop conditions

- Cleanup of a mutation class fails.
- Duplicate customer-visible records from one logical request.
- Confirmation bypass (boolean argument or missing elicitation).
- Secret IT-doc write succeeds.
- KB article body is destroyed (KB article **update** is not implemented; do not improvise one).
- Unrelated QNAP containers are affected (they must remain untouched).
