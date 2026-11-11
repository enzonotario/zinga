import type { QueueItem } from './playQueue';
import type { AttachTarget, GaplessSessionInfo } from './rendererAttach';
import { resolveAttachTarget } from './rendererAttach';

export const STOPPED_CONFIRM_MS = 5000;
export const SELF_HEAL_INTERVAL_MS = 10000;
export const USER_STOP_COOLDOWN_MS = 30000;

export interface SelfHealGate {
  isRemoteMode: boolean
  engineActive: boolean
  hasPending: boolean
  isPaused: boolean
  userStoppedAt: number | null
  now: number
}

export interface SelfHealProbe extends SelfHealGate {
  rendererState: string
  trackUri: string
  positionSec: number
  baseUrl: string
  items: QueueItem[]
  gapless?: GaplessSessionInfo | null
}

export function isStopConfirmed(stoppedSince: number | null, now: number, confirmMs = STOPPED_CONFIRM_MS) {
  return stoppedSince != null && now - stoppedSince >= confirmMs;
}

export function isInUserStopCooldown(userStoppedAt: number | null, now: number) {
  return userStoppedAt != null && now - userStoppedAt < USER_STOP_COOLDOWN_MS;
}

export function canProbeSelfHeal(gate: SelfHealGate) {
  if (gate.isRemoteMode || gate.engineActive || gate.hasPending || gate.isPaused) return false;
  return !isInUserStopCooldown(gate.userStoppedAt, gate.now);
}

export function selfHealTarget(probe: SelfHealProbe): AttachTarget | null {
  if (!canProbeSelfHeal(probe) || probe.rendererState !== 'PLAYING') return null;
  return resolveAttachTarget({
    trackUri: probe.trackUri,
    streamPositionSec: probe.positionSec,
    baseUrl: probe.baseUrl,
    items: probe.items,
    gapless: probe.gapless,
  });
}
