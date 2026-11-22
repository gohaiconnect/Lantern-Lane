import { LANTERN_COLOR_MAP, SHOP_HELPER_MAP } from './catalog';
import type {
  HelperId,
  LanternColorId,
  PaceZone,
  PersistentProgress,
} from './types';

export const BASE_STARTING_HEARTS = 3;
export const ABSOLUTE_MAX_HEARTS = 6;
export const STORAGE_KEY = 'lantern_lane_progress_v1';

export function createDefaultProgress(): PersistentProgress {
  return {
    bank: 0,
    bestLevel: 1,
    bestScore: 0,
    totalCaught: 0,
    unlockedColors: ['solar'],
    equippedColor: 'solar',
    helpers: {
      extra_heart: 0,
      bonus_rewards: 0,
      starlight_compass: 0,
    },
  };
}

export function loadProgress(storage?: Pick<Storage, 'getItem'>): PersistentProgress {
  const defaults = createDefaultProgress();
  if (!storage) return defaults;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PersistentProgress>;
    const unlocked: LanternColorId[] = Array.isArray(parsed.unlockedColors)
      ? parsed.unlockedColors.filter((id): id is LanternColorId => id in LANTERN_COLOR_MAP)
      : ['solar'];
    if (!unlocked.includes('solar')) unlocked.unshift('solar');
    const equipped: LanternColorId =
      parsed.equippedColor && unlocked.includes(parsed.equippedColor)
        ? parsed.equippedColor
        : 'solar';

    return {
      bank: Math.max(0, Math.floor(Number(parsed.bank) || 0)),
      bestLevel: Math.max(1, Math.floor(Number(parsed.bestLevel) || 1)),
      bestScore: Math.max(0, Math.floor(Number(parsed.bestScore) || 0)),
      totalCaught: Math.max(0, Math.floor(Number(parsed.totalCaught) || 0)),
      unlockedColors: unlocked,
      equippedColor: equipped,
      helpers: {
        extra_heart: clampInt(parsed.helpers?.extra_heart ?? 0, 0, SHOP_HELPER_MAP.extra_heart.maxLevel),
        bonus_rewards: clampInt(parsed.helpers?.bonus_rewards ?? 0, 0, SHOP_HELPER_MAP.bonus_rewards.maxLevel),
        starlight_compass: clampInt(parsed.helpers?.starlight_compass ?? 0, 0, SHOP_HELPER_MAP.starlight_compass.maxLevel),
      },
    };
  } catch {
    return defaults;
  }
}

export function saveProgress(
  progress: PersistentProgress,
  storage?: Pick<Storage, 'setItem'>
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage quota or private-mode failures
  }
}

export function clampInt(value: number, min: number, max: number): number {
  const n = Math.floor(Number(value) || 0);
  return Math.max(min, Math.min(max, n));
}

export function getStartingHearts(progress: PersistentProgress): number {
  return Math.min(ABSOLUTE_MAX_HEARTS, BASE_STARTING_HEARTS + (progress.helpers.extra_heart || 0));
}

export function getLevelDurationSec(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return Math.min(48, 26 + (safeLevel - 1) * 3.5);
}

/**
 * Each level starts a bit fast, accelerates to fastest in the middle (progress = 0.5),
 * and slows down smoothly toward the end so the player finishes with rhythmic control.
 */
export function getLevelSpeedMultiplier(
  level: number,
  progress01: number,
  compassLevel = 0
): number {
  const safeLevel = Math.max(1, Math.floor(level));
  const p = Math.max(0, Math.min(1, progress01));
  const levelScale = 1 + (safeLevel - 1) * 0.13;

  // Starts brisk (1.12), swells via bell curve at midpoint (0.5 -> +0.62 peak), eases down at end (0.86)
  const startSpeed = 1.12;
  const endSpeed = 0.86;
  const linearDrift = startSpeed + (endSpeed - startSpeed) * p;

  const bell = Math.pow(Math.sin(p * Math.PI), 1.35);
  const compassDamp = 1 - Math.min(2, Math.max(0, compassLevel)) * 0.12;
  const peakBoost = 0.66 * bell * compassDamp;

  return Number((levelScale * (linearDrift + peakBoost)).toFixed(4));
}

export function getPaceZone(progress01: number): PaceZone {
  if (progress01 < 0.28) return 'rising';
  if (progress01 <= 0.72) return 'peak';
  return 'easing';
}

export function getSpawnIntervalSec(
  level: number,
  progress01: number,
  compassLevel = 0
): number {
  const speedMult = getLevelSpeedMultiplier(level, progress01, compassLevel);
  const baseInterval = Math.max(0.36, 0.88 - (level - 1) * 0.055);
  return Math.max(0.24, baseInterval / (0.68 + 0.32 * speedMult));
}

export function getPurpleRatio(level: number, progress01: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  const base = Math.min(0.46, 0.24 + (safeLevel - 1) * 0.04);
  const midSurge = 0.1 * Math.sin(Math.max(0, Math.min(1, progress01)) * Math.PI);
  return Math.min(0.54, base + midSurge);
}

export function getGoldValueForCatch(
  isRadiant: boolean,
  streakAfterCatch: number,
  bonusRewardsLevel: number,
  equippedColor: LanternColorId
): number {
  let value = isRadiant ? 3 : 1;

  // Bonus Rewards helper:
  // Lv 1: +1 extra gold every 3rd catch
  // Lv 2: +1 extra gold every 2nd catch
  // Lv 3: double gold on every catch!
  if (bonusRewardsLevel >= 3) {
    value *= 2;
  } else if (bonusRewardsLevel === 2 && streakAfterCatch % 2 === 0) {
    value += 1;
  } else if (bonusRewardsLevel === 1 && streakAfterCatch % 3 === 0) {
    value += 1;
  }

  // Crimson Comet power: +2 bonus gold every 5 consecutive catches
  const colorDef = LANTERN_COLOR_MAP[equippedColor];
  if (colorDef.streakBonusEvery > 0 && streakAfterCatch > 0 && streakAfterCatch % colorDef.streakBonusEvery === 0) {
    value += 2;
  }

  return value;
}

export function getLevelClearBonusGold(level: number, bonusRewardsLevel: number): number {
  const base = 5 + Math.max(0, level - 1) * 3;
  const mult = 1 + Math.max(0, bonusRewardsLevel) * 0.4;
  return Math.round(base * mult);
}

export function applyLevelClearHeartReward(
  currentHearts: number,
  maxHearts: number
): { hearts: number; maxHearts: number; heartEarned: boolean } {
  if (currentHearts < maxHearts) {
    return { hearts: currentHearts + 1, maxHearts, heartEarned: true };
  }
  if (maxHearts < ABSOLUTE_MAX_HEARTS) {
    return { hearts: currentHearts + 1, maxHearts: maxHearts + 1, heartEarned: true };
  }
  return { hearts: currentHearts, maxHearts, heartEarned: false };
}

export interface HazardCollisionInput {
  hearts: number;
  invulnerable: boolean;
  ghostActive: boolean;
  shieldReady: boolean;
}

export interface HazardCollisionResult {
  outcome: 'ignored' | 'ghost_phase' | 'shield_block' | 'damaged' | 'defeated';
  heartsAfter: number;
  consumedShield: boolean;
}

export function resolvePurpleHit(input: HazardCollisionInput): HazardCollisionResult {
  if (input.ghostActive) {
    return {
      outcome: 'ghost_phase',
      heartsAfter: input.hearts,
      consumedShield: false,
    };
  }
  if (input.invulnerable) {
    return {
      outcome: 'ignored',
      heartsAfter: input.hearts,
      consumedShield: false,
    };
  }
  if (input.shieldReady) {
    return {
      outcome: 'shield_block',
      heartsAfter: input.hearts,
      consumedShield: true,
    };
  }
  const nextHearts = Math.max(0, input.hearts - 1);
  return {
    outcome: nextHearts === 0 ? 'defeated' : 'damaged',
    heartsAfter: nextHearts,
    consumedShield: false,
  };
}

export function getHelperNextCost(id: HelperId, currentLevel: number): number | null {
  const def = SHOP_HELPER_MAP[id];
  if (currentLevel >= def.maxLevel) return null;
  return def.baseCost + currentLevel * def.costStep;
}

export function buyLanternColor(
  progress: PersistentProgress,
  colorId: LanternColorId
): { ok: boolean; progress: PersistentProgress; reason?: string } {
  const def = LANTERN_COLOR_MAP[colorId];
  if (!def) {
    return { ok: false, progress, reason: 'Unknown lantern color' };
  }
  if (progress.unlockedColors.includes(colorId)) {
    return {
      ok: true,
      progress: { ...progress, equippedColor: colorId },
    };
  }
  if (progress.bank < def.cost) {
    return { ok: false, progress, reason: 'Not enough gold lanterns in bank' };
  }
  return {
    ok: true,
    progress: {
      ...progress,
      bank: progress.bank - def.cost,
      unlockedColors: [...progress.unlockedColors, colorId],
      equippedColor: colorId,
    },
  };
}

export function equipLanternColor(
  progress: PersistentProgress,
  colorId: LanternColorId
): { ok: boolean; progress: PersistentProgress } {
  if (!progress.unlockedColors.includes(colorId)) {
    return { ok: false, progress };
  }
  return {
    ok: true,
    progress: { ...progress, equippedColor: colorId },
  };
}

export function buyHelperUpgrade(
  progress: PersistentProgress,
  helperId: HelperId
): { ok: boolean; progress: PersistentProgress; reason?: string } {
  const currentLevel = progress.helpers[helperId] ?? 0;
  const cost = getHelperNextCost(helperId, currentLevel);
  if (cost === null) {
    return { ok: false, progress, reason: 'Helper already maxed' };
  }
  if (progress.bank < cost) {
    return { ok: false, progress, reason: 'Not enough gold lanterns in bank' };
  }
  return {
    ok: true,
    progress: {
      ...progress,
      bank: progress.bank - cost,
      helpers: {
        ...progress.helpers,
        [helperId]: currentLevel + 1,
      },
    },
  };
}

export function computeMagnetPull(
  playerX: number,
  playerY: number,
  targetX: number,
  targetY: number,
  radius: number,
  strength: number
): { ax: number; ay: number; active: boolean } {
  if (radius <= 0 || strength <= 0) {
    return { ax: 0, ay: 0, active: false };
  }
  const dx = playerX - targetX;
  const dy = playerY - targetY;
  const distSq = dx * dx + dy * dy;
  if (distSq <= 1 || distSq > radius * radius) {
    return { ax: 0, ay: 0, active: false };
  }
  const dist = Math.sqrt(distSq);
  const falloff = 1 - dist / radius;
  const force = strength * (0.35 + 0.65 * falloff);
  return {
    ax: (dx / dist) * force,
    ay: (dy / dist) * force * 0.55,
    active: true,
  };
}

export function circlesOverlap(
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2: number
): boolean {
  const dx = x1 - x2;
  const dy = y1 - y2;
  const sum = r1 + r2;
  return dx * dx + dy * dy <= sum * sum;
}
