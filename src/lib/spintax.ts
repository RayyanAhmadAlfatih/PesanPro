import crypto from "node:crypto";
import { MessageJobError } from "./message-job-errors";

const MAX_INPUT_LENGTH = 4096;
const MAX_DEPTH = 5;
const MAX_NODES = 500;
const MAX_COMBINATIONS = 10_000;

type TextNode = { type: "text"; value: string };
type ChoiceNode = { type: "choice"; options: SpintaxNode[][] };
export type SpintaxNode = TextNode | ChoiceNode;
export type ParsedSpintax = { source: string; nodes: SpintaxNode[]; combinations: number };

function invalid(message: string): never {
  throw new MessageJobError("INVALID_SPINTAX", message, 422, false);
}

export function parseSpintax(source: string): ParsedSpintax {
  if (!source.trim()) invalid("Spintax message cannot be empty");
  if (source.length > MAX_INPUT_LENGTH) invalid(`Spintax message cannot exceed ${MAX_INPUT_LENGTH} characters`);
  let index = 0;
  let nodeCount = 0;

  const parseSequence = (depth: number, terminators: Set<string>): SpintaxNode[] => {
    const nodes: SpintaxNode[] = [];
    let text = "";
    const flushText = () => {
      if (!text) return;
      nodes.push({ type: "text", value: text });
      text = "";
      nodeCount += 1;
      if (nodeCount > MAX_NODES) invalid("Spintax contains too many parts");
    };

    while (index < source.length && !terminators.has(source[index])) {
      const character = source[index];
      if (character === "\\") {
        index += 1;
        if (index >= source.length) invalid("Spintax cannot end with an escape character");
        const escaped = source[index];
        if (!"{}|\\".includes(escaped)) invalid(`Unsupported escape sequence \\${escaped}`);
        text += escaped;
        index += 1;
        continue;
      }
      if (character === "{") {
        if (depth >= MAX_DEPTH) invalid(`Spintax nesting cannot exceed ${MAX_DEPTH} levels`);
        flushText();
        index += 1;
        const options: SpintaxNode[][] = [];
        while (true) {
          const option = parseSequence(depth + 1, new Set(["|", "}"]));
          if (option.length === 0) invalid("Spintax choices cannot be empty");
          options.push(option);
          if (index >= source.length) invalid("Spintax choice is missing a closing brace");
          const separator = source[index];
          index += 1;
          if (separator === "}") break;
        }
        if (options.length < 2) invalid("Spintax choice must contain at least two options");
        nodes.push({ type: "choice", options });
        nodeCount += 1;
        if (nodeCount > MAX_NODES) invalid("Spintax contains too many parts");
        continue;
      }
      if (character === "}" || character === "|") invalid(`Unexpected '${character}' outside a choice`);
      text += character;
      index += 1;
    }
    flushText();
    return nodes;
  };

  const nodes = parseSequence(0, new Set());
  if (index !== source.length) invalid("Spintax syntax is invalid");

  const countSequence = (sequence: SpintaxNode[]): number => sequence.reduce((product, node) => {
    if (node.type === "text") return product;
    const choiceCount = node.options.reduce((sum, option) => sum + countSequence(option), 0);
    const total = product * choiceCount;
    if (total > MAX_COMBINATIONS) invalid(`Spintax cannot exceed ${MAX_COMBINATIONS} combinations`);
    return total;
  }, 1);

  return { source, nodes, combinations: countSequence(nodes) };
}

function deterministicIndex(seed: string, recipientKey: string, path: string, length: number) {
  const digest = crypto.createHash("sha256").update(`${seed}:${recipientKey}:${path}`).digest();
  return digest.readUInt32BE(0) % length;
}

export function renderSpintax(parsed: ParsedSpintax, seed: string, recipientKey: string) {
  const renderSequence = (nodes: SpintaxNode[], path: string): string => nodes.map((node, index) => {
    if (node.type === "text") return node.value;
    const nodePath = `${path}.${index}`;
    const selected = deterministicIndex(seed, recipientKey, nodePath, node.options.length);
    return renderSequence(node.options[selected], `${nodePath}.${selected}`);
  }).join("");
  const output = renderSequence(parsed.nodes, "root");
  if (output.length > MAX_INPUT_LENGTH) invalid(`Rendered message cannot exceed ${MAX_INPUT_LENGTH} characters`);
  return output;
}

export function previewSpintax(source: string, count = 5) {
  const parsed = parseSpintax(source);
  const safeCount = Math.min(20, Math.max(1, Math.floor(count)));
  return {
    combinations: parsed.combinations,
    samples: Array.from({ length: Math.min(safeCount, parsed.combinations) }, (_, index) => renderSpintax(parsed, "preview", `sample-${index}`)),
  };
}
