export type GamePhase = 'title' | 'playing' | 'paused' | 'levelclear' | 'gameover';

export type LanternColorId = 'solar' | 'cobalt' | 'emerald' | 'pearl' | 'crimson';

export type HelperId = 'extra_heart' | 'bonus_rewards' | 'starlight_compass';

export type LanternKind = 'gold' | 'radiant' | 'purple_drop' | 'purple_sway' | 'purple_seeker';

export type PaceZone = 'rising' | 'peak' | 'easing';

export interface LanternColorDef {
  id: LanternColorId;
  name: string;
  powerName: string;
  powerSummary: string;
  cost: number;
  bodyCore: string;
  bodyEdge: string;
  glowRgba: string;
  trimColor: string;
  accentHex: string;
  hasMagnet: boolean;
  magnetRadius: number;
  magnetStrength: number;
  hasShield: boolean;
  shieldCooldownSec: number;
  hasGhost: boolean;
  ghostDurationSec: number;
  ghostCooldownSec: number;
  speedBonus: number;
  streakBonusEvery: number;
}

export interface HelperDef {
  id: HelperId;
  name: string;
  summary: string;
  maxLevel: number;
  baseCost: number;
  costStep: number;
}

export interface PersistentProgress {
  bank: number;
  bestLevel: number;
  bestScore: number;
  totalCaught: number;
  unlockedColors: LanternColorId[];
  equippedColor: LanternColorId;
  helpers: Record<HelperId, number>;
}

export interface FallingLantern {
  id: number;
  kind: LanternKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseX: number;
  age: number;
  swayPhase: number;
  swayAmp: number;
  swayFreq: number;
  telegraphTime: number;
  lockedTracking: boolean;
  caughtOrHit: boolean;
  fadeOut: number;
}

export interface HudSnapshot {
  phase: GamePhase;
  level: number;
  hearts: number;
  maxHearts: number;
  lastDamagedHeartIndex: number;
  damageFlashMs: number;
  bank: number;
  runGold: number;
  levelGold: number;
  streak: number;
  levelProgress: number;
  paceZone: PaceZone;
  speedMultiplier: number;
  equippedColor: LanternColorId;
  shieldReady: boolean;
  shieldCharge01: number;
  ghostActive: boolean;
  ghostReady: boolean;
  ghostCharge01: number;
  muted: boolean;
}

export interface RunSummary {
  outcome: 'levelclear' | 'gameover';
  level: number;
  levelGold: number;
  clearBonusGold: number;
  heartEarned: boolean;
  heartsAfter: number;
  maxHeartsAfter: number;
  totalBank: number;
  bestStreak: number;
  catchesThisLevel: number;
  levelProgress: number;
}
