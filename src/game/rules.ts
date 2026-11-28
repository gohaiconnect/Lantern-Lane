import { LANTERN_COLOR_MAP, SHOP_HELPER_MAP } from './catalog';
import type {
  HelperId,
  LanternColorId,
  LanternKind,
  PaceZone,
  PersistentProgress,
  PowerState,
} from './types';

export const BASE_STARTING_HEARTS = 3;
export const ABSOLUTE_MAX_HEARTS = 6;
export const STORAGE_KEY = 'lantern_lane_progress_v1';
export const TIME_SLOW_FACTOR = 0.45;

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

/**
 * Compute vertical flight bounds strictly within the lower half of the viewport.
 */
export function getPlayerVerticalBounds(
  viewportHeight: number,
  playerRadius: number
): { minY: number; maxY: number } {
  const safeH = Math.max(320, viewportHeight);
  const minY = Math.round(safeH * 0.5 + playerRadius + 4);
  const maxY = Math.max(minY + 24, Math.round(safeH - Math.max(46, playerRadius + 24)));
  return { minY, maxY };
}

export function clampPlayerPosition(
  x: number,
  y: number,
  laneLeft: number,
  laneRight: number,
  viewportHeight: number,
  playerRadius: number
): { x: number; y: number } {
  const minX = laneLeft + playerRadius + 8;
  const maxX = Math.max(minX, laneRight - playerRadius - 8);
  const { minY, maxY } = getPlayerVerticalBounds(viewportHeight, playerRadius);
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
  };
}

export function normalizeMoveVector(dx: number, dy: number): { x: number; y: number } {
  const len = Math.hypot(dx, dy);
  if (len <= 0.0001) return { x: 0, y: 0 };
  return { x: dx / len, y: dy / len };
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

  const startSpeed = 1.12;
  const endSpeed = 0.86;
  const linearDrift = startSpeed + (endSpeed - startSpeed) * p;

  const bell = Math.pow(Math.sin(p * Math.PI), 1.35);
  const compassDamp = 1 - Math.min(2, Math.max(0, compassLevel)) * 0.12;
  const peakBoost = 0.66 * bell * compassDamp;

  return Number((levelScale * (linearDrift + peakBoost)).toFixed(4));
}

export function getEffectiveFallSpeedMultiplier(
  baseSpeedMult: number,
  timeSlowActive: boolean
): number {
  return Number((baseSpeedMult * (timeSlowActive ? TIME_SLOW_FACTOR : 1)).toFixed(4));
}

/**
 * Maps live speed multiplier (~0.85 calm finish up to ~2.1+ high-level peak surge)
 * into a clamped [0, 1] nebula transition intensity.
 */
export function getNebulaIntensityForSpeed(speedMultiplier: number): number {
  const minSpeed = 0.88;
  const maxSpeed = 2.05;
  const normalized = (speedMultiplier - minSpeed) / (maxSpeed - minSpeed);
  return Math.max(0, Math.min(1, Number(normalized.toFixed(4))));
}

/**
 * Splits normalized nebula intensity [0, 1] into smooth cross-fade weights across
 * three pre-rendered space nebula palettes: calm (0), mid-surge (0.5), and peak (1).
 */
export function getNebulaLayerWeights(intensity: number): {
  calm: number;
  mid: number;
  peak: number;
} {
  const t = Math.max(0, Math.min(1, intensity));
  if (t <= 0.5) {
    const mid = t * 2;
    return { calm: Number((1 - mid).toFixed(4)), mid: Number(mid.toFixed(4)), peak: 0 };
  }
  const peak = (t - 0.5) * 2;
  return { calm: 0, mid: Number((1 - peak).toFixed(4)), peak: Number(peak.toFixed(4)) };
}

export function stepNebulaIntensity(current: number, target: number, dt: number): number {
  const safeDt = Math.max(0, Math.min(0.1, dt));
  const next = current + (target - current) * Math.min(1, safeDt * 2.6);
  return Math.max(0, Math.min(1, next));
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

/**
 * Duration-limited power timer machine for all earned lantern colors.
 */
export interface PowerTimerSnapshot {
  state: PowerState;
  activeRemaining: number;
  cooldownRemaining: number;
  charge01: number;
}

export function createInitialPowerTimer(colorId: LanternColorId): PowerTimerSnapshot {
  const def = LANTERN_COLOR_MAP[colorId];
  if (!def || def.powerType === 'none' || def.powerDurationSec <= 0) {
    return { state: 'none', activeRemaining: 0, cooldownRemaining: 0, charge01: 0 };
  }
  return { state: 'ready', activeRemaining: 0, cooldownRemaining: 0, charge01: 1 };
}

export function activatePowerTimer(
  current: PowerTimerSnapshot,
  colorId: LanternColorId
): { activated: boolean; next: PowerTimerSnapshot } {
  const def = LANTERN_COLOR_MAP[colorId];
  if (!def || def.powerType === 'none' || def.powerDurationSec <= 0) {
    return { activated: false, next: current };
  }
  if (current.state !== 'ready') {
    return { activated: false, next: current };
  }
  return {
    activated: true,
    next: {
      state: 'active',
      activeRemaining: def.powerDurationSec,
      cooldownRemaining: 0,
      charge01: 1,
    },
  };
}

export function tickPowerTimer(
  current: PowerTimerSnapshot,
  colorId: LanternColorId,
  dt: number
): PowerTimerSnapshot {
  const def = LANTERN_COLOR_MAP[colorId];
  if (!def || def.powerType === 'none' || def.powerDurationSec <= 0) {
    return { state: 'none', activeRemaining: 0, cooldownRemaining: 0, charge01: 0 };
  }
  const safeDt = Math.max(0, dt);

  if (current.state === 'active') {
    const remaining = current.activeRemaining - safeDt;
    if (remaining > 0) {
      return {
        state: 'active',
        activeRemaining: remaining,
        cooldownRemaining: 0,
        charge01: Math.max(0, Math.min(1, remaining / def.powerDurationSec)),
      };
    }
    const overflow = Math.abs(remaining);
    const cd = Math.max(0, def.powerCooldownSec - overflow);
    if (cd <= 0) {
      return { state: 'ready', activeRemaining: 0, cooldownRemaining: 0, charge01: 1 };
    }
    return {
      state: 'cooldown',
      activeRemaining: 0,
      cooldownRemaining: cd,
      charge01: Math.max(0, Math.min(1, 1 - cd / def.powerCooldownSec)),
    };
  }

  if (current.state === 'cooldown') {
    const cd = Math.max(0, current.cooldownRemaining - safeDt);
    if (cd <= 0) {
      return { state: 'ready', activeRemaining: 0, cooldownRemaining: 0, charge01: 1 };
    }
    return {
      state: 'cooldown',
      activeRemaining: 0,
      cooldownRemaining: cd,
      charge01: Math.max(0, Math.min(1, 1 - cd / def.powerCooldownSec)),
    };
  }

  return current;
}

export function getGoldValueForCatch(
  isRadiant: boolean,
  streakAfterCatch: number,
  bonusRewardsLevel: number,
  equippedColor: LanternColorId,
  powerActive = false
): number {
  let value = isRadiant ? 3 : 1;

  if (bonusRewardsLevel >= 3) {
    value *= 2;
  } else if (bonusRewardsLevel === 2 && streakAfterCatch % 2 === 0) {
    value += 1;
  } else if (bonusRewardsLevel === 1 && streakAfterCatch % 3 === 0) {
    value += 1;
  }

  // Crimson Comet Surge doubles gold while active
  const colorDef = LANTERN_COLOR_MAP[equippedColor];
  if (colorDef.powerType === 'comet_surge' && powerActive) {
    value *= 2;
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
  shieldActive: boolean;
}

export interface HazardCollisionResult {
  outcome: 'ignored' | 'ghost_phase' | 'shield_block' | 'damaged' | 'defeated';
  heartsAfter: number;
}

export function resolvePurpleHit(input: HazardCollisionInput): HazardCollisionResult {
  if (input.ghostActive) {
    return {
      outcome: 'ghost_phase',
      heartsAfter: input.hearts,
    };
  }
  if (input.shieldActive) {
    return {
      outcome: 'shield_block',
      heartsAfter: input.hearts,
    };
  }
  if (input.invulnerable) {
    return {
      outcome: 'ignored',
      heartsAfter: input.hearts,
    };
  }
  const nextHearts = Math.max(0, input.hearts - 1);
  return {
    outcome: nextHearts === 0 ? 'defeated' : 'damaged',
    heartsAfter: nextHearts,
  };
}

export function resolveProjectileHit(
  projectileStyle: 'candle' | 'starlight',
  targetKind: LanternKind
): 'catch_gold' | 'eliminate_purple' | 'ignore' {
  const isGold = targetKind === 'gold' || targetKind === 'radiant';
  if (isGold) {
    return 'catch_gold';
  }
  // Candle shots eliminate purple obstacles; Starlight Net wisps focus purely on catching gold lanterns
  return projectileStyle === 'candle' ? 'eliminate_purple' : 'ignore';
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
    ay: (dy / dist) * force * 0.7,
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
