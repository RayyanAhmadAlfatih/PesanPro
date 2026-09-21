import { MessageJobError } from "./message-job-errors";
import { parseSpintax, renderSpintax } from "./spintax";

const VARIABLE_PATTERN = /{{\s*([A-Za-z_][A-Za-z0-9_]{0,63})\s*}}/g;
const MAX_VARIABLES = 20;
const TOKEN_PREFIX = "\uE000pp_var_";
const TOKEN_SUFFIX = "\uE001";

export type BroadcastVariables = Record<string, string>;

type ProtectedTemplate = {
  source: string;
  protectedSource: string;
  variables: string[];
  tokens: Map<string, string>;
};

function invalidTemplate(message: string): never {
  throw new MessageJobError("INVALID_BROADCAST_TEMPLATE", message, 422, false);
}

export function extractBroadcastVariables(source: string) {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const match of source.matchAll(VARIABLE_PATTERN)) {
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
    if (names.length > MAX_VARIABLES) invalidTemplate(`Broadcast template cannot use more than ${MAX_VARIABLES} variables`);
  }
  return names;
}

export function protectBroadcastVariables(source: string): ProtectedTemplate {
  const variables = extractBroadcastVariables(source);
  const tokens = new Map<string, string>();
  const protectedSource = source.replace(VARIABLE_PATTERN, (_match, name: string) => {
    let token = tokens.get(name);
    if (!token) {
      token = `${TOKEN_PREFIX}${tokens.size}${TOKEN_SUFFIX}`;
      tokens.set(name, token);
    }
    return token;
  });
  return { source, protectedSource, variables, tokens };
}

export function validateBroadcastTemplate(source: string) {
  const protectedTemplate = protectBroadcastVariables(source);
  const parsed = parseSpintax(protectedTemplate.protectedSource);
  return {
    source: protectedTemplate.source,
    variables: protectedTemplate.variables,
    combinations: parsed.combinations,
  };
}

export function renderBroadcastTemplate(source: string, seed: string, recipientKey: string, variables: BroadcastVariables = {}) {
  const protectedTemplate = protectBroadcastVariables(source);
  const parsed = parseSpintax(protectedTemplate.protectedSource);
  let output = renderSpintax(parsed, seed, recipientKey);
  for (const [name, token] of protectedTemplate.tokens.entries()) {
    if (!Object.prototype.hasOwnProperty.call(variables, name)) {
      invalidTemplate(`Missing value for variable {{${name}}}`);
    }
    output = output.split(token).join(variables[name]);
  }
  if (output.length > 4096) invalidTemplate("Rendered broadcast message cannot exceed 4096 characters");
  return output;
}

export function previewBroadcastTemplate(source: string, variables: BroadcastVariables = {}, count = 5) {
  const protectedTemplate = protectBroadcastVariables(source);
  const parsed = parseSpintax(protectedTemplate.protectedSource);
  const safeCount = Math.min(20, Math.max(1, Math.floor(count)));
  const samples = Array.from({ length: Math.min(safeCount, parsed.combinations) }, (_, index) => {
    let output = renderSpintax(parsed, "preview", `sample-${index}`);
    for (const [name, token] of protectedTemplate.tokens.entries()) {
      output = output.split(token).join(Object.prototype.hasOwnProperty.call(variables, name) ? variables[name] : `{{${name}}}`);
    }
    return output;
  });
  return { combinations: parsed.combinations, samples, variables: protectedTemplate.variables };
}
