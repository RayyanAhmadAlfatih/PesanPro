import type { SegmentDefinitionInput } from "./segment-input";

export const MAX_SEGMENT_CANDIDATES = 10_000;
export const MAX_SEGMENT_COMPLEXITY = 30;

export function segmentComplexity(definition: SegmentDefinitionInput) {
  return definition.consentStatuses.length
    + definition.tagIds.length * 2
    + definition.labelIds.length * 2
    + definition.sources.length
    + definition.attributes.length * 2
    + Number(Boolean(definition.lastActivityFrom))
    + Number(Boolean(definition.lastActivityTo));
}

export function assertSegmentComplexity(definition: SegmentDefinitionInput) {
  const complexity = segmentComplexity(definition);
  if (complexity > MAX_SEGMENT_COMPLEXITY) {
    throw new Error(`Segment complexity ${complexity} exceeds the limit ${MAX_SEGMENT_COMPLEXITY}`);
  }
  return complexity;
}

function readPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[part];
  }, value);
}

export function matchesSegmentAttributes(attributes: unknown, filters: SegmentDefinitionInput["attributes"]) {
  return filters.every((filter) => {
    const actual = readPath(attributes, filter.key);
    if (filter.operator === "EXISTS") return actual !== undefined && actual !== null;
    if (filter.operator === "EQUALS") return String(actual ?? "") === filter.value;
    return String(actual ?? "").toLocaleLowerCase().includes((filter.value ?? "").toLocaleLowerCase());
  });
}

export function uniqueIds(values: readonly string[]) {
  return [...new Set(values)];
}
