"use server";

import type { AutoReplyWriteInput } from "@/lib/autoreply-input";
import {
  createAutoReplyRule,
  deleteAutoReplyRule,
  listAutoReplyLogs,
  listAutoReplyRules,
  previewAutoReply,
  setAutoReplyRuleEnabled,
  updateAutoReplyRule,
} from "@/lib/autoreply-service";
import { getAuthenticatedUserForAction } from "@/lib/server-action-auth";

async function actor() {
  const user = await getAuthenticatedUserForAction();
  if (!user) throw new Error("Unauthorized");
  return user;
}

type RuleInput = Omit<AutoReplyWriteInput, "sessionId">;

export async function getAutoReplies(sessionId: string) {
  return listAutoReplyRules(await actor(), sessionId);
}

export async function createAutoReply(sessionId: string, data: RuleInput) {
  return createAutoReplyRule(await actor(), { ...data, sessionId });
}

export async function updateAutoReply(sessionId: string, ruleId: string, data: RuleInput) {
  return updateAutoReplyRule(await actor(), ruleId, { ...data, sessionId });
}

export async function deleteAutoReply(sessionId: string, ruleId: string) {
  return deleteAutoReplyRule(await actor(), sessionId, ruleId);
}

export async function toggleAutoReply(sessionId: string, ruleId: string, isEnabled: boolean) {
  return setAutoReplyRuleEnabled(await actor(), sessionId, ruleId, isEnabled);
}

export async function testAutoReply(sessionId: string, text: string, isGroup: boolean) {
  return previewAutoReply(await actor(), { sessionId, text, isGroup });
}

export async function getAutoReplyLogs(sessionId: string, limit = 50) {
  return listAutoReplyLogs(await actor(), sessionId, limit);
}
