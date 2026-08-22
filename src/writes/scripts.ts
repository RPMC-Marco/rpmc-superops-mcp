import { createHash } from "node:crypto";
import type { ToolClassification } from "../audit.js";
import { asArray, asRecord } from "../investigate/common.js";

const DESTRUCTIVE_PATTERN =
  /\b(delet(?:e|ion)|wipe|format|destroy|purge|erase|shred|cipher\s*\/w|rm\s+-rf|diskpart|remove[- ](?:user[- ]?profile|profile|data|disk|partition)|destructive)\b/i;
const DISRUPTIVE_PATTERN =
  /\b(reboot|restart|shutdown|power[- ]?off|log\s*off|logoff|stop[- ](?:the[- ])?(?:service|process)|kill[- ]process|disable[- ](?:nic|network|adapter)|interrupt[- ]network)\b/i;
const LOW_PATTERN =
  /\b(diagnostic|inventory|collect(?:ion)?|sysinfo|systeminfo|whoami|ipconfig|get-computerinfo|hwinfo|list[- ](?:software|patches|services|hotfixes)|gather[- ](?:info|inventory)|read[- ]only)\b/i;

const RANK: Record<ToolClassification, number> = {
  read: 0,
  write_low: 1,
  write_visible: 2,
  disruptive: 3,
  destructive: 4,
};

export interface ScriptMetadata {
  scriptId?: unknown;
  name?: unknown;
  description?: unknown;
  readMe?: unknown;
  tags?: unknown;
  language?: unknown;
}

export interface ScriptClassification {
  classification: ToolClassification;
  reason: string;
  classifiedFrom: "metadata" | "unknown_default" | "config_raise";
  unknown: boolean;
}

function textBlob(meta: ScriptMetadata): string {
  const tags = asArray(meta.tags)
    .map((item) => (typeof item === "string" ? item : JSON.stringify(asRecord(item))))
    .join(" ");
  return [meta.name, meta.description, meta.readMe, tags, meta.language].filter((item) => typeof item === "string").join("\n");
}

function fromMetadata(meta: ScriptMetadata): ScriptClassification {
  const text = textBlob(meta);
  if (!text.trim()) {
    return {
      classification: "disruptive",
      reason: "Script metadata was empty; unknown scripts classify upward to disruptive",
      classifiedFrom: "unknown_default",
      unknown: true,
    };
  }
  if (DESTRUCTIVE_PATTERN.test(text)) {
    return {
      classification: "destructive",
      reason: "Script metadata matched destructive impact patterns",
      classifiedFrom: "metadata",
      unknown: false,
    };
  }
  if (DISRUPTIVE_PATTERN.test(text)) {
    return {
      classification: "disruptive",
      reason: "Script metadata matched disruptive impact patterns",
      classifiedFrom: "metadata",
      unknown: false,
    };
  }
  if (LOW_PATTERN.test(text)) {
    return {
      classification: "write_low",
      reason: "Script metadata matched diagnostic/inventory collection patterns",
      classifiedFrom: "metadata",
      unknown: false,
    };
  }
  return {
    classification: "disruptive",
    reason: "Script metadata could not be confidently classified; classified upward to disruptive",
    classifiedFrom: "unknown_default",
    unknown: true,
  };
}

function parseRaises(raw: string | undefined): Map<string, ToolClassification> {
  const out = new Map<string, ToolClassification>();
  if (!raw?.trim()) return out;
  for (const part of raw.split(",")) {
    const [id, klass] = part.split(":").map((item) => item.trim());
    if (!id) continue;
    if (klass === "write_visible" || klass === "disruptive" || klass === "destructive") {
      out.set(id, klass);
    }
  }
  return out;
}

export function classifyScriptConsequence(
  meta: ScriptMetadata,
  options: { raiseMap?: Map<string, ToolClassification>; raiseEnv?: string } = {}
): ScriptClassification {
  const base = fromMetadata(meta);
  const raises = options.raiseMap ?? parseRaises(options.raiseEnv);
  const scriptId = typeof meta.scriptId === "string" ? meta.scriptId : "";
  const raised = scriptId ? raises.get(scriptId) : undefined;
  if (raised && RANK[raised] > RANK[base.classification]) {
    return {
      classification: raised,
      reason: `${base.reason}; raised by configuration (cannot lower)`,
      classifiedFrom: "config_raise",
      unknown: base.unknown,
    };
  }
  return base;
}

export function scriptParamDigest(scriptId: string, assetId: string, args: unknown): string {
  return createHash("sha256").update(JSON.stringify({ scriptId, assetId, args })).digest("hex");
}

export function higherClassification(left: ToolClassification, right: ToolClassification): ToolClassification {
  return RANK[left] >= RANK[right] ? left : right;
}
