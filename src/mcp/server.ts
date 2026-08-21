import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/server";
import type { AppConfig } from "../config.js";
import { buildToolCallAudit, writeAudit } from "../audit.js";
import { registeredCapabilities } from "../capabilities.js";
import type { SuperOpsClient } from "../superops/client.js";
import { handleTool } from "../tools/handlers.js";

export function listMcpTools() {
  return registeredCapabilities().map((capability) => ({
    name: capability.name,
    description: capability.description,
    inputSchema: capability.inputSchema.toJSONSchema(),
  }));
}

export function createMcpServer(config: AppConfig, client: SuperOpsClient): McpServer {
  const server = new McpServer({ name: "rpmc-superops-mcp", version: "0.1.4" });

  for (const capability of registeredCapabilities()) {
    server.registerTool(
      capability.name,
      {
        description: capability.description,
        inputSchema: capability.inputSchema,
        annotations: { readOnlyHint: true, destructiveHint: false },
      },
      async (args: Record<string, unknown>) => {
        const started = Date.now();
        const requestId = randomUUID();
        const record = args && typeof args === "object" ? args : {};
        const result = await handleTool(capability.name, record, client, config);
        writeAudit(
          buildToolCallAudit({
            toolName: capability.name,
            classification: capability.classification,
            operationKind: capability.operationKind,
            durationMs: Date.now() - started,
            isError: Boolean(result.isError),
            argumentKeys: Object.keys(record).slice(0, 20),
            requestId,
            errorSummary: result.isError ? result.auditDetail ?? result.content[0]?.text : undefined,
            investigation: result.audit,
          })
        );
        return {
          content: result.content.map((part) => ({ type: "text" as const, text: part.text })),
          isError: Boolean(result.isError),
        };
      }
    );
  }

  return server;
}
