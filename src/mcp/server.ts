import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/server";
import type { AppConfig } from "../config.js";
import { writeAudit } from "../audit.js";
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
  const server = new McpServer({ name: "rpmc-superops-mcp", version: "0.1.2" });

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
        writeAudit({
          event: "mcp.tool_call",
          timestamp: new Date().toISOString(),
          requestId,
          toolName: capability.name,
          classification: capability.classification,
          success: !result.isError,
          durationMs: Date.now() - started,
          errorSummary: result.isError ? result.auditDetail ?? result.content[0]?.text : undefined,
          metadata: { argumentKeys: Object.keys(record).slice(0, 20) },
        });
        return {
          content: result.content.map((part) => ({ type: "text" as const, text: part.text })),
          isError: Boolean(result.isError),
        };
      }
    );
  }

  return server;
}
