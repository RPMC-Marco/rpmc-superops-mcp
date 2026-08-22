import { randomUUID } from "node:crypto";
import { inputRequired, McpServer } from "@modelcontextprotocol/server";
import type { AppConfig } from "../config.js";
import type { ToolClassification } from "../audit.js";
import { buildToolCallAudit, writeAudit } from "../audit.js";
import { registeredCapabilities } from "../capabilities.js";
import { PRODUCT_VERSION } from "../version.js";
import type { SuperOpsClient } from "../superops/client.js";
import { handleTool } from "../tools/handlers.js";
import { AuthorizationRequiredError } from "../writes/errors.js";
import { mcpContextFrom } from "../writes/authorization.js";

export function listMcpTools(config?: Pick<AppConfig, "writesEnabled">) {
  return registeredCapabilities({ writesEnabled: config?.writesEnabled !== false }).map((capability) => ({
    name: capability.name,
    description: capability.description,
    inputSchema: capability.inputSchema.toJSONSchema(),
  }));
}

export function createMcpServer(config: AppConfig, client: SuperOpsClient): McpServer {
  const server = new McpServer({ name: "rpmc-superops-mcp", version: PRODUCT_VERSION });

  for (const capability of registeredCapabilities({ writesEnabled: config.writesEnabled })) {
    const write = capability.operationKind === "mutation";
    const authorizationTool = capability.phase2Registered === true && capability.operationKind === "local";
    server.registerTool(
      capability.name,
      {
        description: capability.description,
        inputSchema: capability.inputSchema,
        annotations: {
          readOnlyHint: !write && capability.classification === "read",
          destructiveHint: capability.classification === "destructive" || capability.classification === "disruptive",
        },
      },
      async (args: Record<string, unknown>, ctx?: unknown) => {
        const started = Date.now();
        const requestId = randomUUID();
        const record = args && typeof args === "object" ? args : {};
        try {
          const result = await handleTool(capability.name, record, client, config, mcpContextFrom(ctx));
          const effective = (result.audit?.metadata?.effectiveClassification as ToolClassification | undefined) ?? capability.classification;
          writeAudit(
            buildToolCallAudit({
              toolName: capability.name,
              classification: effective,
              operationKind: capability.operationKind,
              durationMs: Date.now() - started,
              isError: Boolean(result.isError),
              argumentKeys: Object.keys(record).slice(0, 20),
              requestId,
              errorSummary: result.isError ? result.auditDetail ?? result.content[0]?.text : undefined,
              investigation: {
                outcome: result.audit?.outcome ?? (result.isError ? "failed" : "complete"),
                errorCode: result.audit?.errorCode,
                metadata: {
                  registeredClassification: capability.classification,
                  effectiveClassification: effective,
                  ...result.audit?.metadata,
                },
              },
            })
          );
          return {
            content: result.content.map((part) => ({ type: "text" as const, text: part.text })),
            isError: Boolean(result.isError),
          };
        } catch (error) {
          if (error instanceof AuthorizationRequiredError) {
            const effective = error.classification ?? capability.classification;
            writeAudit(
              buildToolCallAudit({
                toolName: capability.name,
                classification: effective,
                operationKind: capability.operationKind,
                durationMs: Date.now() - started,
                isError: false,
                argumentKeys: Object.keys(record).slice(0, 20),
                requestId,
                investigation: {
                  outcome: "failed",
                  errorCode: "authorization_required",
                  metadata: {
                    registeredClassification: capability.classification,
                    effectiveClassification: effective,
                    authorizationRequired: true,
                    authorizationResult: "pending",
                    authorizationGrantPresent: authorizationTool,
                  },
                },
              })
            );
            return inputRequired({
              inputRequests: {
                confirm: inputRequired.elicit({
                  message: error.elicit.message,
                  requestedSchema: error.elicit.requestedSchema as never,
                }),
              },
              requestState: error.elicit.requestState,
            });
          }
          throw error;
        }
      }
    );
  }

  return server;
}
