export type AutoReplyThrottleState = {
  windowStartedAt: Date;
  triggerCount: number;
  lastTriggeredAt: Date;
};

export type AutoReplyThrottlePolicy = {
  cooldownSeconds: number;
  rateLimitCount: number;
  rateLimitWindowSeconds: number;
  maxChainDepth: number;
};

export function decideAutoReplyThrottle(
  state: AutoReplyThrottleState | null,
  policy: AutoReplyThrottlePolicy,
  now = new Date(),
) {
  const nowMs = now.getTime();
  const cooldownMs = policy.cooldownSeconds * 1000;
  const windowMs = policy.rateLimitWindowSeconds * 1000;
  if (state && cooldownMs > 0 && nowMs < state.lastTriggeredAt.getTime() + cooldownMs) {
    return { allowed: false as const, reasonCode: "COOLDOWN_ACTIVE", nextState: state, chainDepth: state.triggerCount };
  }

  const withinWindow = Boolean(state && nowMs < state.windowStartedAt.getTime() + windowMs);
  const triggerCount = withinWindow && state ? state.triggerCount : 0;
  if (triggerCount >= policy.rateLimitCount) {
    return { allowed: false as const, reasonCode: "CONTACT_RATE_LIMITED", nextState: state!, chainDepth: triggerCount };
  }
  if (triggerCount >= policy.maxChainDepth) {
    return { allowed: false as const, reasonCode: "CHAIN_LIMIT_REACHED", nextState: state!, chainDepth: triggerCount };
  }

  const nextCount = triggerCount + 1;
  const windowStartedAt = withinWindow && state ? state.windowStartedAt : now;
  return {
    allowed: true as const,
    reasonCode: "ALLOWED",
    chainDepth: nextCount,
    nextState: { windowStartedAt, triggerCount: nextCount, lastTriggeredAt: now },
    expiresAt: new Date(Math.max(nowMs + cooldownMs, windowStartedAt.getTime() + windowMs)),
  };
}
