export type GamePhase = 'title' | 'playing' | 'paused' | 'levelclear' | 'gameover';

export type LanternColorId =
  | 'solar'
  | 'cobalt'
  | 'emerald'
  | 'pearl'
  | 'candle'
  | 'prism'
  | 'frost'
  | 'crimson';

export type PowerType =
  | 'none'
  | 'magnet'
  | 'shield'
  | 'ghost'
  | 'candle_shot'
  | 'sky_net'
  | 'time_slow'
  | 'comet_surge';

export type PowerState = 'none' | 'ready' | 'active' | 'cooldown';

export type HelperId = 'extra_heart' | 'bonus_rewards' | 'starlight_compass';

export type LanternKind = 'gold' | 'radiant' | 'purple_drop' | 'purple_sway' | 'purple_seeker';

export type PaceZone = 'rising' | 'peak' | 'easing';

export interface LanternColorDef {
  id: LanternColorId;
  name: string;
  powerType: PowerType;
  powerName: string;
  powerSummary: string;
  cost: number;
  bodyCore: string;
  bodyEdge: string;
  glowRgba: string;
  trimColor: string;
  accentHex: string;
  /** Active power duration in seconds (0 for starter with no active power). */
  powerDurationSec: number;
  /** Recharge cooldown in seconds after active duration finishes. */
  powerCooldownSec: number;
  magnetRadius: number;
  magnetStrength: number;
  speedBonus: number;
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

export interface CandleProjectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  maxLife: number;
  style: 'candle' | 'starlight';
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
  powerState: PowerState;
  powerRemainingSec: number;
  powerDurationSec: number;
  powerCharge01: number;
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
