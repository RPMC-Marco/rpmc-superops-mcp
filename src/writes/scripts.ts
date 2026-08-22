import { createHash } from "node:crypto";
import type { ToolClassification } from "../audit.js";
import { asArray, asRecord } from "../investigate/common.js";
import { CONSEQUENCE_RANK, higherClassification } from "./consequence.js";

/**
 * Scripts (and any future ad-hoc command runner) are classified by EFFECT and TARGET,
 * not by operation verbs. `Remove-Item`, `del`, `rm`, `Clear-*`, and `Uninstall-*`
 * are not destructive by themselves.
 *
 * Destructive = material, difficult-to-reverse, or irreversible loss of valuable data,
 * configuration, identity, recovery capability, or meaningful system state.
 *
 * Uncertain mutating scripts classify upward. The caller cannot lower classification.
 * A future ad-hoc PowerShell/CMD runner must classify the actual command/effect rather
 * than trusting a generic wrapper script name.
 */

const WINDOW = String.raw`[\w\s./:\\-]{0,48}`;

const VALUABLE_LOSS_PATTERNS: RegExp[] = [
  new RegExp(String.raw`\b(?:delet(?:e|ion)|remove|wipe|destroy|erase|purge)\b${WINDOW}\buser[- ]?profiles?\b`, "i"),
  new RegExp(String.raw`\buser[- ]?profiles?\b${WINDOW}\b(?:delet(?:e|ion)|remove|wipe|destroy|erase|purge)\b`, "i"),
  new RegExp(
    String.raw`\b(?:delet(?:e|ion)|remove|wipe|destroy|erase|purge)\b${WINDOW}\b(?:backups?|recovery(?:\s+data)?|restore[- ]?points?|shadow[- ]?copies|system[- ]?state)\b`,
    "i"
  ),
  new RegExp(
    String.raw`\b(?:backups?|recovery(?:\s+data)?|restore[- ]?points?|shadow[- ]?copies|system[- ]?state)\b${WINDOW}\b(?:delet(?:e|ion)|remove|wipe|destroy|erase|purge)\b`,
    "i"
  ),
  new RegExp(
    String.raw`\b(?:delet(?:e|ion)|remove|wipe|destroy|erase)\b${WINDOW}\b(?:production|business|customer)[- ]?(?:files?|data|documents?)\b`,
    "i"
  ),
  new RegExp(
    String.raw`\b(?:production|business|customer)[- ]?(?:files?|data|documents?)\b${WINDOW}\b(?:delet(?:e|ion)|remove|wipe|destroy|erase)\b`,
    "i"
  ),
  new RegExp(
    String.raw`\b(?:delet(?:e|ion)|remove|wipe|destroy|overwrite|reset)\b${WINDOW}\b(?:unique\s+)?(?:configuration|config(?:uration)?\s+state)\b`,
    "i"
  ),
  new RegExp(String.raw`\boverwrite\b${WINDOW}\b(?:unique\s+)?(?:configuration|config)\b`, "i"),
  new RegExp(String.raw`\b(?:reset|destroy|wipe|delet(?:e|ion)|remove)\b${WINDOW}\b(?:user\s+)?identity\b`, "i"),
  new RegExp(String.raw`\b(?:reset|destroy)\b${WINDOW}\b(?:computer[- ]?account|machine[- ]?account|\bsid\b)\b`, "i"),
  /\bformat\s+(?:the\s+)?(?:[a-z]:\\?|(?:disk|drive|volume|partition|storage))\b/i,
  /\b(?:wipe|repartition|re-partition)\s+(?:the\s+)?(?:disk|drive|volume|partition|machine|endpoint|storage)\b/i,
  /\bdiskpart\b/i,
  /\bcipher\s*\/w\b/i,
  /\b(?:secure[- ]?erase|shred)\b/i,
];

const DISPOSABLE_CLEANUP_PATTERNS: RegExp[] = [
  new RegExp(
    String.raw`\b(?:clear|delet(?:e|ion)|remove|clean(?:up)?|purge)\b${WINDOW}\b(?:temp(?:orary)?(?:\s+(?:files?|dirs?|directories))?|tmp|%temp%|installer(?:\s+(?:directory|dir|cache|files?))?|prefetch|dns(?:[- ]?cache)?|(?:app(?:lication)?[- ]?)?cache|disposable|regeneratable|rebuildable)\b`,
    "i"
  ),
  new RegExp(
    String.raw`\b(?:temp(?:orary)?(?:\s+(?:files?|dirs?|directories))?|tmp|%temp%|installer(?:\s+(?:directory|dir|cache|files?))?|prefetch|dns(?:[- ]?cache)?|(?:app(?:lication)?[- ]?)?cache)\b${WINDOW}\b(?:clear|delet(?:e|ion)|remove|clean(?:up)?|purge|flush)\b`,
    "i"
  ),
  /\b(?:flushdns|flush[- ]dns|ipconfig\s+\/flushdns)\b/i,
  /\b(?:regeneratable|rebuildable|disposable)\s+(?:cache|state|files?)\b/i,
];

const INTERRUPT_PATTERNS: RegExp[] = [
  /\b(reboot|restart|shutdown|power[- ]?off|log\s*off|logoff|stop[- ](?:the[- ])?(?:service|process)|kill[- ]process|disable[- ](?:nic|network|adapter)|interrupt[- ]network)\b/i,
  /\b(?:uninstall|reinstall)\b/i,
  /\brequires?\s+restart\b/i,
  /\brestart(?:ing)?\s+(?:the\s+)?(?:application|service|process|app)\b/i,
];

const DIAGNOSTIC_PATTERN =
  /\b(diagnostic|inventory|collect(?:ion)?|sysinfo|systeminfo|whoami|ipconfig|get-computerinfo|hwinfo|list[- ](?:software|patches|services|hotfixes)|gather[- ](?:info|inventory)|read[- ]only)\b/i;

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

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
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

  const valuableLoss = matchesAny(text, VALUABLE_LOSS_PATTERNS);
  const disposable = matchesAny(text, DISPOSABLE_CLEANUP_PATTERNS);
  const interrupt = matchesAny(text, INTERRUPT_PATTERNS);
  const diagnostic = DIAGNOSTIC_PATTERN.test(text);

  if (valuableLoss) {
    return {
      classification: "destructive",
      reason: "Script metadata indicates material/irreversible loss of valuable data, configuration, identity, or recovery state",
      classifiedFrom: "metadata",
      unknown: false,
    };
  }

  if (disposable) {
    if (interrupt) {
      return {
        classification: "disruptive",
        reason: "Script metadata indicates regeneratable cleanup that may interrupt a service or application",
        classifiedFrom: "metadata",
        unknown: false,
      };
    }
    return {
      classification: "write_low",
      reason: "Script metadata indicates disposable/regeneratable cleanup, not loss of valuable state",
      classifiedFrom: "metadata",
      unknown: false,
    };
  }

  if (interrupt) {
    return {
      classification: "disruptive",
      reason: "Script metadata matched disruptive impact patterns",
      classifiedFrom: "metadata",
      unknown: false,
    };
  }

  if (diagnostic) {
    return {
      classification: "write_low",
      reason: "Script metadata matched diagnostic/inventory collection patterns",
      classifiedFrom: "metadata",
      unknown: false,
    };
  }

  return {
    classification: "disruptive",
    reason: "Script metadata could not be confidently classified; classified upward to disruptive. Deletion verbs alone are not treated as destructive.",
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
  if (raised && CONSEQUENCE_RANK[raised] > CONSEQUENCE_RANK[base.classification]) {
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

export { higherClassification };
