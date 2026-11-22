import { LanternAudio } from './audio';
import { LANTERN_COLOR_MAP } from './catalog';
import {
  applyLevelClearHeartReward,
  circlesOverlap,
  computeMagnetPull,
  getGoldValueForCatch,
  getLevelClearBonusGold,
  getLevelDurationSec,
  getLevelSpeedMultiplier,
  getPaceZone,
  getPurpleRatio,
  getSpawnIntervalSec,
  getStartingHearts,
  resolvePurpleHit,
} from './rules';
import type {
  FallingLantern,
  GamePhase,
  HudSnapshot,
  LanternKind,
  PersistentProgress,
  RunSummary,
} from './types';

interface Star {
  x: number;
  y: number;
  size: number;
  speed: number;
  alpha: number;
  twinklePhase: number;
  tint: string;
}

interface AmbientLantern {
  x: number;
  y: number;
  vy: number;
  swayPhase: number;
  scale: number;
  isPurple: boolean;
}

interface PooledParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  glow: boolean;
}

interface FloatingText {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

interface TrailPoint {
  x: number;
  y: number;
  alpha: number;
}

export interface EngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onProgressChange: (next: PersistentProgress) => void;
  onRunSummary: (summary: RunSummary | null) => void;
  onPhaseChange: (phase: GamePhase) => void;
}

const PARTICLE_POOL_SIZE = 180;
const FLOATING_TEXT_POOL_SIZE = 24;
const STAR_COUNT = 120;
const AMBIENT_COUNT = 14;
const PLAYER_RADIUS = 24;

function createGlowStamp(innerRgba: string, outerRgba: string): HTMLCanvasElement {
  const size = 96;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const gctx = off.getContext('2d');
  if (gctx) {
    const grad = gctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    grad.addColorStop(0, innerRgba);
    grad.addColorStop(1, outerRgba);
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, size, size);
  }
  return off;
}

export class LanternLaneEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private audio: LanternAudio;
  private callbacks: EngineCallbacks;
  private progress: PersistentProgress;

  // Pre-rendered offscreen caches to avoid heavy per-frame radial gradients
  private bgCanvas: HTMLCanvasElement;
  private glowStamps: Record<string, HTMLCanvasElement> = {};

  private width = 1280;
  private height = 720;
  private dpr = 1;
  private laneLeft = 180;
  private laneRight = 1100;

  private rafId: number | null = null;
  private lastTimestamp = 0;
  private destroyed = false;
  private resizeObserver: ResizeObserver | null = null;
  private modalOpen = false;
  private pausedRenderedOnce = false;

  // Game State
  private phase: GamePhase = 'title';
  private level = 1;
  private hearts = 3;
  private maxHearts = 3;
  private lastDamagedHeartIndex = -1;
  private damageFlashTimer = 0;
  private runGold = 0;
  private levelGold = 0;
  private catchesThisLevel = 0;
  private streak = 0;
  private bestStreak = 0;
  private levelElapsed = 0;
  private levelDuration = 26;
  private spawnTimer = 0.8;
  private nextLanternId = 1;
  private worldTime = 0;

  // Player state
  private playerX = 640;
  private playerY = 600;
  private playerVx = 0;
  private playerTilt = 0;
  private squashX = 1;
  private squashY = 1;
  private invulnTimer = 0;
  private hitFlashTimer = 0;
  private shieldCharge = 1;
  private ghostActiveTimer = 0;
  private ghostCooldownTimer = 0;
  private ghostBufferTimer = 0;
  private defeatDelayTimer = 0;
  private pendingDefeat = false;

  // Juice
  private hitstopTimer = 0;
  private trauma = 0;
  private hudEmitTimer = 0;
  private progressBarEl: HTMLDivElement | null = null;

  // Entities & Pools (Zero-GC ring buffers)
  private falling: FallingLantern[] = [];
  private stars: Star[] = [];
  private ambient: AmbientLantern[] = [];
  private particles: PooledParticle[] = [];
  private particleCursor = 0;
  private floaters: FloatingText[] = [];
  private floaterCursor = 0;
  private trail: TrailPoint[] = [];

  // Input
  private keysHeld = new Set<string>();
  private pointerActive = false;
  private pointerTargetX: number | null = null;
  private titleHoverX: number | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    initialProgress: PersistentProgress,
    audio: LanternAudio,
    callbacks: EngineCallbacks
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Could not initialize 2D canvas context');
    }
    this.ctx = ctx;
    this.audio = audio;
    this.callbacks = callbacks;
    this.progress = initialProgress;
    this.bgCanvas = document.createElement('canvas');

    this.initGlowStamps();
    this.initPools();
    this.handleResize();
    this.initScenery();
    this.playerX = this.width * 0.5;
    this.playerY = this.height - Math.max(92, this.height * 0.14);
    this.hearts = getStartingHearts(this.progress);
    this.maxHearts = this.hearts;

    this.bindEvents();
    this.emitHud(true);
    this.render();
    this.startLoop();
  }

  private initGlowStamps(): void {
    this.glowStamps = {
      gold: createGlowStamp('rgba(251, 191, 36, 0.45)', 'rgba(251, 191, 36, 0)'),
      radiant: createGlowStamp('rgba(254, 240, 138, 0.62)', 'rgba(251, 191, 36, 0)'),
      purple: createGlowStamp('rgba(168, 85, 247, 0.48)', 'rgba(88, 28, 135, 0)'),
      flash: createGlowStamp('rgba(255, 255, 255, 0.85)', 'rgba(255, 255, 255, 0)'),
      solar: createGlowStamp('rgba(251, 191, 36, 0.45)', 'rgba(251, 191, 36, 0)'),
      cobalt: createGlowStamp('rgba(56, 189, 248, 0.48)', 'rgba(56, 189, 248, 0)'),
      emerald: createGlowStamp('rgba(52, 211, 153, 0.48)', 'rgba(52, 211, 153, 0)'),
      pearl: createGlowStamp('rgba(226, 232, 240, 0.48)', 'rgba(226, 232, 240, 0)'),
      crimson: createGlowStamp('rgba(251, 113, 133, 0.48)', 'rgba(251, 113, 133, 0)'),
    };
  }

  private rebuildBackdropCache(): void {
    const w = this.width;
    const h = this.height;
    this.bgCanvas.width = w;
    this.bgCanvas.height = h;
    const bctx = this.bgCanvas.getContext('2d');
    if (!bctx) return;

    const sky = bctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#060816');
    sky.addColorStop(0.48, '#0b1028');
    sky.addColorStop(1, '#121633');
    bctx.fillStyle = sky;
    bctx.fillRect(0, 0, w, h);

    const drawNebula = (x: number, y: number, radius: number, color: string) => {
      const grad = bctx.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      bctx.fillStyle = grad;
      bctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    };

    const m = Math.min(w, h);
    drawNebula(w * 0.22, h * 0.28, m * 0.45, 'rgba(245, 158, 11, 0.06)');
    drawNebula(w * 0.78, h * 0.62, m * 0.42, 'rgba(99, 102, 241, 0.07)');
    drawNebula(w * 0.5, h * 0.88, m * 0.36, 'rgba(251, 191, 36, 0.05)');
  }

  public setModalOpen(open: boolean): void {
    this.modalOpen = open;
    if (!open) {
      this.lastTimestamp = performance.now();
      this.pausedRenderedOnce = false;
      this.render();
    }
  }

  public bindDirectDomRefs(progressBarEl: HTMLDivElement | null): void {
    this.progressBarEl = progressBarEl;
  }

  public syncProgress(next: PersistentProgress): void {
    const prevExtra = this.progress.helpers.extra_heart;
    this.progress = next;
    const newStarting = getStartingHearts(next);
    if (next.helpers.extra_heart > prevExtra) {
      const gained = next.helpers.extra_heart - prevExtra;
      this.maxHearts = Math.min(6, Math.max(this.maxHearts + gained, newStarting));
      this.hearts = Math.min(this.maxHearts, this.hearts + gained);
    } else if (this.phase === 'title') {
      this.maxHearts = newStarting;
      this.hearts = newStarting;
    }
    this.pausedRenderedOnce = false;
    this.render();
    this.emitHud(true);
  }

  public getPhase(): GamePhase {
    return this.phase;
  }

  public toggleMute(): boolean {
    const muted = this.audio.toggleMuted();
    this.emitHud(true);
    return muted;
  }

  public triggerGhostPower(): void {
    if (this.phase !== 'playing' || this.pendingDefeat) return;
    const colorDef = LANTERN_COLOR_MAP[this.progress.equippedColor];
    if (!colorDef.hasGhost) return;
    this.ghostBufferTimer = 0.14;
  }

  public startNewRun(fromUserGesture = true): void {
    if (fromUserGesture) {
      this.audio.unlock();
    }
    this.keysHeld.clear();
    this.pointerActive = false;
    this.pointerTargetX = null;
    this.level = 1;
    this.maxHearts = getStartingHearts(this.progress);
    this.hearts = this.maxHearts;
    this.runGold = 0;
    this.bestStreak = 0;
    this.callbacks.onRunSummary(null);
    this.beginLevel(1);
  }

  public startNextLevel(): void {
    this.audio.unlock();
    this.keysHeld.clear();
    this.pointerActive = false;
    this.pointerTargetX = null;
    this.callbacks.onRunSummary(null);
    this.beginLevel(this.level + 1);
  }

  public restartCurrentRun(): void {
    this.startNewRun();
  }

  public pause(): void {
    if (this.phase !== 'playing' || this.pendingDefeat) return;
    this.keysHeld.clear();
    this.pointerActive = false;
    this.pausedRenderedOnce = false;
    this.setPhase('paused');
    this.emitHud(true);
  }

  public resume(): void {
    if (this.phase !== 'paused') return;
    this.keysHeld.clear();
    this.pointerActive = false;
    this.lastTimestamp = performance.now();
    this.pausedRenderedOnce = false;
    this.setPhase('playing');
    this.emitHud(true);
  }

  public returnToTitle(): void {
    this.keysHeld.clear();
    this.pointerActive = false;
    this.pointerTargetX = null;
    this.falling = [];
    this.pendingDefeat = false;
    this.defeatDelayTimer = 0;
    this.maxHearts = getStartingHearts(this.progress);
    this.hearts = this.maxHearts;
    this.callbacks.onRunSummary(null);
    this.pausedRenderedOnce = false;
    this.setPhase('title');
    this.emitHud(true);
  }

  public destroy(): void {
    this.destroyed = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.unbindEvents();
  }

  private setPhase(phase: GamePhase): void {
    this.phase = phase;
    if (typeof document !== 'undefined') {
      const bodyState = phase === 'levelclear' ? 'gameover' : phase;
      document.body.dataset.state = bodyState;
    }
    this.callbacks.onPhaseChange(phase);
  }

  private beginLevel(levelNum: number): void {
    this.level = levelNum;
    this.levelElapsed = 0;
    this.levelDuration = getLevelDurationSec(levelNum);
    this.levelGold = 0;
    this.catchesThisLevel = 0;
    this.streak = 0;
    this.falling = [];
    this.trail = [];
    this.playerX = this.width * 0.5;
    this.playerVx = 0;
    this.playerTilt = 0;
    this.squashX = 1;
    this.squashY = 1;
    this.invulnTimer = 0.6;
    this.hitFlashTimer = 0;
    this.hitstopTimer = 0;
    this.trauma = 0;
    this.pendingDefeat = false;
    this.defeatDelayTimer = 0;
    this.damageFlashTimer = 0;
    this.lastDamagedHeartIndex = -1;
    this.pausedRenderedOnce = false;

    const colorDef = LANTERN_COLOR_MAP[this.progress.equippedColor];
    this.shieldCharge = colorDef.hasShield ? 1 : 0;
    this.ghostActiveTimer = 0;
    this.ghostCooldownTimer = 0;
    this.ghostBufferTimer = 0;

    this.spawnTimer = 0.65;
    this.spawnOpeningGoldLantern();

    this.setPhase('playing');
    this.emitHud(true);
  }

  private spawnOpeningGoldLantern(): void {
    const offset = (Math.random() - 0.5) * Math.min(180, (this.laneRight - this.laneLeft) * 0.35);
    const x = Math.max(this.laneLeft + 44, Math.min(this.laneRight - 44, this.width * 0.5 + offset));
    this.falling.push({
      id: this.nextLanternId++,
      kind: 'gold',
      x,
      y: -36,
      vx: 0,
      vy: 175,
      radius: 20,
      baseX: x,
      age: 0,
      swayPhase: Math.random() * Math.PI * 2,
      swayAmp: 14,
      swayFreq: 1.6,
      telegraphTime: 0,
      lockedTracking: false,
      caughtOrHit: false,
      fadeOut: 0,
    });
  }

  private initPools(): void {
    this.particles = Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 2,
      life: 0,
      maxLife: 1,
      color: '#fbbf24',
      glow: false,
    }));
    this.floaters = Array.from({ length: FLOATING_TEXT_POOL_SIZE }, () => ({
      active: false,
      x: 0,
      y: 0,
      vy: -50,
      text: '',
      color: '#fde68a',
      life: 0,
      maxLife: 0.8,
    }));
  }

  private pickSideBiasedAmbientX(): number {
    // Keep the central title negative-space calmer by biasing ambient lanterns toward the left & right wings
    const leftSide = Math.random() < 0.5;
    if (leftSide) {
      return 32 + Math.random() * Math.max(60, this.width * 0.32);
    }
    return this.width * 0.68 + Math.random() * Math.max(60, this.width * 0.32 - 32);
  }

  private initScenery(): void {
    const starTints = ['#ffffff', '#fef3c7', '#dbeafe', '#e9d5ff', '#fde68a'];
    this.stars = Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      size: 0.7 + Math.random() * 1.9,
      speed: 14 + Math.random() * 48,
      alpha: 0.25 + Math.random() * 0.65,
      twinklePhase: Math.random() * Math.PI * 2,
      tint: starTints[Math.floor(Math.random() * starTints.length)],
    }));

    this.ambient = Array.from({ length: AMBIENT_COUNT }, (_, i) => ({
      x: this.pickSideBiasedAmbientX(),
      y: Math.random() * this.height,
      vy: 18 + Math.random() * 24,
      swayPhase: Math.random() * Math.PI * 2,
      scale: 0.58 + Math.random() * 0.45,
      isPurple: i % 4 === 0,
    }));
  }

  private handleResize = (): void => {
    const parent = this.canvas.parentElement;
    const rect = parent ? parent.getBoundingClientRect() : this.canvas.getBoundingClientRect();
    const w = Math.max(320, Math.round(rect.width || window.innerWidth));
    const h = Math.max(420, Math.round(rect.height || window.innerHeight));
    this.dpr = Math.min(2, window.devicePixelRatio || 1);

    const prevW = this.width || w;
    this.width = w;
    this.height = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.rebuildBackdropCache();

    const maxLaneWidth = Math.min(w - 36, 780);
    this.laneLeft = (w - maxLaneWidth) * 0.5;
    this.laneRight = this.laneLeft + maxLaneWidth;

    const ratio = prevW > 0 ? this.playerX / prevW : 0.5;
    this.playerX = Math.max(
      this.laneLeft + PLAYER_RADIUS + 8,
      Math.min(this.laneRight - PLAYER_RADIUS - 8, ratio * w)
    );
    this.playerY = this.height - Math.max(88, Math.min(132, this.height * 0.145));
    this.pausedRenderedOnce = false;
  };

  private screenToWorldX(clientX: number): number {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0) return this.width * 0.5;
    return ((clientX - rect.left) / rect.width) * this.width;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Space') {
      if ((this.phase === 'playing' || this.phase === 'title') && !this.modalOpen) {
        e.preventDefault();
      }
    }

    if (e.repeat || this.modalOpen) return;

    if (e.code === 'KeyM') {
      this.toggleMute();
      return;
    }

    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (this.phase === 'playing') {
        this.pause();
      } else if (this.phase === 'paused') {
        this.resume();
      }
      return;
    }

    if (this.phase === 'playing') {
      if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.triggerGhostPower();
      }
    }

    this.keysHeld.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keysHeld.delete(e.code);
  };

  private onPointerDown = (e: PointerEvent): void => {
    this.audio.unlock();
    if (this.phase !== 'playing' || this.modalOpen) return;
    if (e.button === 2) {
      this.triggerGhostPower();
      return;
    }
    this.pointerActive = true;
    this.pointerTargetX = this.screenToWorldX(e.clientX);
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events without pointer capture support
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.modalOpen) return;
    const wx = this.screenToWorldX(e.clientX);
    if (this.phase === 'title') {
      this.titleHoverX = wx;
      return;
    }
    if (this.phase === 'playing' && this.pointerActive) {
      this.pointerTargetX = wx;
    }
  };

  private onPointerUp = (): void => {
    this.pointerActive = false;
    this.pointerTargetX = null;
  };

  private onContextMenu = (e: MouseEvent): void => {
    if (this.phase === 'playing') {
      e.preventDefault();
    }
  };

  private onWindowBlur = (): void => {
    this.keysHeld.clear();
    this.pointerActive = false;
    this.pointerTargetX = null;
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      this.keysHeld.clear();
      this.pointerActive = false;
      this.pointerTargetX = null;
    }
  };

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    window.addEventListener('resize', this.handleResize);
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);

    if (typeof ResizeObserver !== 'undefined' && this.canvas.parentElement) {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.canvas.parentElement);
    }
  }

  private unbindEvents(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);

    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  private startLoop(): void {
    this.lastTimestamp = performance.now();
    const tick = (now: number) => {
      if (this.destroyed) return;
      const rawDt = (now - this.lastTimestamp) / 1000;
      this.lastTimestamp = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      // Avoid burning CPU/compositor frames behind static Shop or Pause modals
      const staticOverlay = this.modalOpen || this.phase === 'paused';
      if (staticOverlay) {
        if (!this.pausedRenderedOnce) {
          this.render();
          this.pausedRenderedOnce = true;
        }
      } else {
        this.update(dt);
        this.render();
      }

      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private update(dt: number): void {
    this.worldTime += dt;

    const starPace =
      this.phase === 'playing'
        ? getLevelSpeedMultiplier(
            this.level,
            Math.min(1, this.levelElapsed / this.levelDuration),
            this.progress.helpers.starlight_compass
          )
        : 0.42;

    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      s.y += s.speed * starPace * dt;
      if (s.y > this.height + 6) {
        s.y = -6;
        s.x = Math.random() * this.width;
      }
    }

    if (this.phase !== 'playing') {
      for (let i = 0; i < this.ambient.length; i++) {
        const a = this.ambient[i];
        a.y += a.vy * dt;
        if (a.y > this.height + 44) {
          a.y = -44;
          a.x = this.pickSideBiasedAmbientX();
        }
      }

      if (this.phase === 'title') {
        const targetX =
          this.titleHoverX !== null
            ? this.width * 0.5 + (this.titleHoverX - this.width * 0.5) * 0.32
            : this.width * 0.5 + Math.sin(this.worldTime * 0.9) * 34;
        const dx = targetX - this.playerX;
        this.playerX += dx * Math.min(1, dt * 4.5);
        this.playerTilt = Math.max(-0.22, Math.min(0.22, dx * 0.0025));
      }

      this.updateParticles(dt);
      this.updateFloaters(dt);
      return;
    }

    this.trauma = Math.max(0, this.trauma - dt * 2.2);
    this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    this.damageFlashTimer = Math.max(0, this.damageFlashTimer - dt);
    this.updateParticles(dt);
    this.updateFloaters(dt);

    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      return;
    }

    if (this.pendingDefeat) {
      this.defeatDelayTimer -= dt;
      if (this.defeatDelayTimer <= 0) {
        this.pendingDefeat = false;
        this.finishGameOver();
      }
      return;
    }

    this.levelElapsed += dt;
    const progress01 = Math.min(1, this.levelElapsed / this.levelDuration);
    const compassLevel = this.progress.helpers.starlight_compass;
    const speedMult = getLevelSpeedMultiplier(this.level, progress01, compassLevel);

    if (this.progressBarEl) {
      this.progressBarEl.style.transform = `scaleX(${progress01.toFixed(4)})`;
    }

    if (this.levelElapsed >= this.levelDuration) {
      this.finishLevelClear();
      return;
    }

    const colorDef = LANTERN_COLOR_MAP[this.progress.equippedColor];

    if (colorDef.hasShield && this.shieldCharge < 1) {
      this.shieldCharge = Math.min(1, this.shieldCharge + dt / colorDef.shieldCooldownSec);
    }

    if (this.ghostActiveTimer > 0) {
      this.ghostActiveTimer = Math.max(0, this.ghostActiveTimer - dt);
      if (this.ghostActiveTimer === 0) {
        this.ghostCooldownTimer = colorDef.ghostCooldownSec;
      }
    } else if (this.ghostCooldownTimer > 0) {
      this.ghostCooldownTimer = Math.max(0, this.ghostCooldownTimer - dt);
    }

    if (this.ghostBufferTimer > 0) {
      this.ghostBufferTimer = Math.max(0, this.ghostBufferTimer - dt);
      if (colorDef.hasGhost && this.ghostActiveTimer <= 0 && this.ghostCooldownTimer <= 0) {
        this.ghostActiveTimer = colorDef.ghostDurationSec;
        this.ghostBufferTimer = 0;
        this.audio.playGhostPhase();
        this.spawnBurst(this.playerX, this.playerY, '#e2e8f0', 14, 150);
        this.spawnFloater(this.playerX, this.playerY - 42, 'GHOST PHASE', '#e2e8f0');
        this.emitHud(true);
      }
    }

    if (this.invulnTimer > 0) {
      this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    }

    const minX = this.laneLeft + PLAYER_RADIUS + 8;
    const maxX = this.laneRight - PLAYER_RADIUS - 8;

    const moveLeft = this.keysHeld.has('ArrowLeft') || this.keysHeld.has('KeyA');
    const moveRight = this.keysHeld.has('ArrowRight') || this.keysHeld.has('KeyD');
    const dir = (moveRight ? 1 : 0) - (moveLeft ? 1 : 0);

    const maxSpeed = 610 * colorDef.speedBonus;
    if (dir !== 0) {
      const accel = 4400 * colorDef.speedBonus;
      this.playerVx += dir * accel * dt;
      this.playerVx = Math.max(-maxSpeed, Math.min(maxSpeed, this.playerVx));
      this.pointerActive = false;
      this.pointerTargetX = null;
    } else if (this.pointerActive && this.pointerTargetX !== null) {
      const clampedTarget = Math.max(minX, Math.min(maxX, this.pointerTargetX));
      const diff = clampedTarget - this.playerX;
      this.playerVx = Math.max(-maxSpeed * 1.45, Math.min(maxSpeed * 1.45, diff * 18));
    } else {
      this.playerVx *= Math.exp(-15 * dt);
      if (Math.abs(this.playerVx) < 4) this.playerVx = 0;
    }

    this.playerX += this.playerVx * dt;
    if (this.playerX < minX) {
      this.playerX = minX;
      this.playerVx = 0;
    } else if (this.playerX > maxX) {
      this.playerX = maxX;
      this.playerVx = 0;
    }

    const targetTilt = Math.max(-0.28, Math.min(0.28, (this.playerVx / maxSpeed) * 0.24));
    this.playerTilt += (targetTilt - this.playerTilt) * Math.min(1, dt * 16);

    this.squashX += (1 - this.squashX) * Math.min(1, dt * 13);
    this.squashY += (1 - this.squashY) * Math.min(1, dt * 13);

    if (Math.abs(this.playerVx) > 85 || colorDef.id === 'crimson') {
      this.trail.push({ x: this.playerX, y: this.playerY, alpha: colorDef.id === 'crimson' ? 0.55 : 0.25 });
      if (this.trail.length > 10) this.trail.shift();
    }
    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].alpha -= dt * 2.2;
      if (this.trail[i].alpha <= 0) {
        this.trail.splice(i, 1);
      }
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnLantern(progress01, speedMult);
      const interval = getSpawnIntervalSec(this.level, progress01, compassLevel);
      this.spawnTimer = interval * (0.82 + Math.random() * 0.36);
    }

    let hudDirty = false;
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const item = this.falling[i];
      if (item.caughtOrHit) {
        item.fadeOut += dt * 5;
        if (item.fadeOut >= 1) {
          this.falling.splice(i, 1);
        }
        continue;
      }

      item.age += dt;

      if (item.telegraphTime > 0) {
        item.telegraphTime = Math.max(0, item.telegraphTime - dt);
        continue;
      }

      const isGold = item.kind === 'gold' || item.kind === 'radiant';

      if (isGold && colorDef.hasMagnet) {
        const pull = computeMagnetPull(
          this.playerX,
          this.playerY,
          item.x,
          item.y,
          colorDef.magnetRadius,
          colorDef.magnetStrength
        );
        if (pull.active) {
          item.vx += pull.ax * dt;
          item.vy += pull.ay * dt;
          item.baseX = item.x;
        }
      }

      if (item.kind === 'purple_sway' || item.kind === 'gold' || item.kind === 'radiant') {
        if (!colorDef.hasMagnet || !isGold) {
          item.x = item.baseX + Math.sin(item.age * item.swayFreq + item.swayPhase) * item.swayAmp;
        } else {
          item.x += item.vx * dt;
          item.vx *= Math.exp(-3.5 * dt);
        }
      } else if (item.kind === 'purple_seeker') {
        if (!item.lockedTracking && item.y < this.height * 0.52) {
          const dx = this.playerX - item.x;
          const steer = Math.max(-155, Math.min(155, dx * 1.4));
          item.vx += (steer - item.vx) * Math.min(1, dt * 3.2);
        } else {
          item.lockedTracking = true;
          item.vx *= Math.exp(-5 * dt);
        }
        item.x += item.vx * dt;
      } else {
        item.x += item.vx * dt;
      }

      item.x = Math.max(this.laneLeft + item.radius + 6, Math.min(this.laneRight - item.radius - 6, item.x));
      item.y += item.vy * speedMult * dt;

      const hitRadius = isGold ? PLAYER_RADIUS + 5 : PLAYER_RADIUS - 4;
      const itemHitRadius = isGold ? item.radius + 3 : item.radius - 3;

      if (circlesOverlap(this.playerX, this.playerY, hitRadius, item.x, item.y, itemHitRadius)) {
        if (isGold) {
          this.handleGoldCatch(item);
          hudDirty = true;
        } else {
          const resolved = this.handlePurpleCollision(item);
          if (resolved) hudDirty = true;
        }
      } else if (item.y > this.height + 54) {
        this.falling.splice(i, 1);
      }
    }

    this.hudEmitTimer += dt;
    if (hudDirty || this.hudEmitTimer >= 0.12) {
      this.hudEmitTimer = 0;
      this.emitHud(false);
    }
  }

  private spawnLantern(progress01: number, speedMult: number): void {
    const margin = 36;
    const span = Math.max(80, this.laneRight - this.laneLeft - margin * 2);

    const purpleChance =
      this.level === 1 && this.levelElapsed < 2.2 ? 0 : getPurpleRatio(this.level, progress01);

    const isPurple = Math.random() < purpleChance;
    let x = this.laneLeft + margin + Math.random() * span;

    for (let attempt = 0; attempt < 4; attempt++) {
      const tooClose = this.falling.some(
        (other) => other.y < 70 && Math.abs(other.x - x) < 58
      );
      if (!tooClose) break;
      x = this.laneLeft + margin + Math.random() * span;
    }

    const compassBonus = this.progress.helpers.starlight_compass * 0.14;

    if (!isPurple) {
      const isRadiant = Math.random() < (this.level >= 2 ? 0.13 : 0.08);
      this.falling.push({
        id: this.nextLanternId++,
        kind: isRadiant ? 'radiant' : 'gold',
        x,
        y: -30,
        vx: 0,
        vy: isRadiant ? 235 : 195 + Math.random() * 45,
        radius: isRadiant ? 21 : 18,
        baseX: x,
        age: 0,
        swayPhase: Math.random() * Math.PI * 2,
        swayAmp: 12 + Math.random() * 18,
        swayFreq: 1.5 + Math.random() * 1.1,
        telegraphTime: 0,
        lockedTracking: false,
        caughtOrHit: false,
        fadeOut: 0,
      });
    } else {
      const roll = Math.random();
      let kind: LanternKind = 'purple_drop';
      if (this.level >= 2 && roll > 0.68) {
        kind = 'purple_seeker';
      } else if (roll > 0.36) {
        kind = 'purple_sway';
      }

      const baseVy =
        kind === 'purple_drop'
          ? 245 + Math.random() * 45
          : kind === 'purple_sway'
            ? 205 + Math.random() * 35
            : 215 + Math.random() * 30;

      const telegraph = (kind === 'purple_drop' ? 0.42 : 0.34) + compassBonus + (speedMult > 1.55 ? 0.06 : 0);

      this.falling.push({
        id: this.nextLanternId++,
        kind,
        x,
        y: 12,
        vx: 0,
        vy: baseVy,
        radius: 19,
        baseX: x,
        age: 0,
        swayPhase: Math.random() * Math.PI * 2,
        swayAmp: kind === 'purple_sway' ? 38 + Math.random() * 28 : 0,
        swayFreq: 2.2 + Math.random() * 0.9,
        telegraphTime: telegraph,
        lockedTracking: false,
        caughtOrHit: false,
        fadeOut: 0,
      });
    }
  }

  private handleGoldCatch(item: FallingLantern): void {
    item.caughtOrHit = true;
    this.catchesThisLevel += 1;
    this.streak += 1;
    if (this.streak > this.bestStreak) {
      this.bestStreak = this.streak;
    }

    const isRadiant = item.kind === 'radiant';
    const earned = getGoldValueForCatch(
      isRadiant,
      this.streak,
      this.progress.helpers.bonus_rewards,
      this.progress.equippedColor
    );

    this.levelGold += earned;
    this.runGold += earned;

    this.progress = {
      ...this.progress,
      bank: this.progress.bank + earned,
      totalCaught: this.progress.totalCaught + 1,
      bestScore: Math.max(this.progress.bestScore, this.runGold),
    };
    this.callbacks.onProgressChange(this.progress);

    this.squashX = 1.18;
    this.squashY = 0.85;
    this.audio.playCatch(this.streak, isRadiant);
    this.spawnBurst(
      item.x,
      item.y,
      isRadiant ? '#fffbeb' : '#fbbf24',
      isRadiant ? 16 : 8,
      isRadiant ? 185 : 130
    );
    this.spawnFloater(
      item.x,
      item.y - 18,
      `+${earned}`,
      earned >= 3 ? '#fef08a' : '#fde68a'
    );
  }

  private handlePurpleCollision(item: FallingLantern): boolean {
    const colorDef = LANTERN_COLOR_MAP[this.progress.equippedColor];
    const resolution = resolvePurpleHit({
      hearts: this.hearts,
      invulnerable: this.invulnTimer > 0,
      ghostActive: this.ghostActiveTimer > 0,
      shieldReady: colorDef.hasShield && this.shieldCharge >= 1,
    });

    if (resolution.outcome === 'ghost_phase') {
      if (!item.caughtOrHit) {
        item.caughtOrHit = true;
        this.spawnBurst(item.x, item.y, '#e2e8f0', 8, 90);
        this.spawnFloater(this.playerX, this.playerY - 38, 'PHASED', '#e2e8f0');
      }
      return false;
    }

    if (resolution.outcome === 'ignored') {
      return false;
    }

    item.caughtOrHit = true;

    if (resolution.outcome === 'shield_block') {
      this.shieldCharge = 0;
      this.invulnTimer = 0.65;
      this.hitstopTimer = 0.04;
      this.trauma = Math.min(1, this.trauma + 0.38);
      this.squashX = 1.24;
      this.squashY = 0.8;
      this.audio.playShieldBlock();
      this.spawnBurst(item.x, item.y, '#34d399', 20, 210);
      this.spawnFloater(this.playerX, this.playerY - 40, 'WARD BLOCKED', '#6ee7b7');
      return true;
    }

    this.lastDamagedHeartIndex = this.hearts - 1;
    this.hearts = resolution.heartsAfter;
    this.streak = 0;
    this.damageFlashTimer = 0.45;
    this.hitFlashTimer = 0.07;
    this.hitstopTimer = 0.06;
    this.trauma = Math.min(1, this.trauma + 0.72);
    this.invulnTimer = 1.25;
    this.squashX = 0.78;
    this.squashY = 1.24;
    this.audio.playHit();
    this.spawnBurst(item.x, item.y, '#c084fc', 24, 240);
    this.spawnBurst(this.playerX, this.playerY, '#f43f5e', 10, 160);
    this.spawnFloater(this.playerX, this.playerY - 40, '-1 HEART', '#fda4af');

    if (resolution.outcome === 'defeated') {
      this.pendingDefeat = true;
      this.defeatDelayTimer = 0.52;
      this.audio.playDefeat();
    }

    return true;
  }

  private finishLevelClear(): void {
    const heartReward = applyLevelClearHeartReward(this.hearts, this.maxHearts);
    this.hearts = heartReward.hearts;
    this.maxHearts = heartReward.maxHearts;

    const clearBonusGold = getLevelClearBonusGold(
      this.level,
      this.progress.helpers.bonus_rewards
    );
    this.runGold += clearBonusGold;

    this.progress = {
      ...this.progress,
      bank: this.progress.bank + clearBonusGold,
      bestLevel: Math.max(this.progress.bestLevel, this.level + 1),
      bestScore: Math.max(this.progress.bestScore, this.runGold),
    };
    this.callbacks.onProgressChange(this.progress);

    this.audio.playLevelClear();
    this.spawnBurst(this.playerX, this.playerY, '#fbbf24', 28, 260);
    this.falling = [];

    const summary: RunSummary = {
      outcome: 'levelclear',
      level: this.level,
      levelGold: this.levelGold,
      clearBonusGold,
      heartEarned: heartReward.heartEarned,
      heartsAfter: this.hearts,
      maxHeartsAfter: this.maxHearts,
      totalBank: this.progress.bank,
      bestStreak: this.bestStreak,
      catchesThisLevel: this.catchesThisLevel,
      levelProgress: 1,
    };

    this.setPhase('levelclear');
    this.callbacks.onRunSummary(summary);
    this.emitHud(true);
  }

  private finishGameOver(): void {
    const progress01 = Math.min(1, this.levelElapsed / this.levelDuration);
    const summary: RunSummary = {
      outcome: 'gameover',
      level: this.level,
      levelGold: this.levelGold,
      clearBonusGold: 0,
      heartEarned: false,
      heartsAfter: 0,
      maxHeartsAfter: this.maxHearts,
      totalBank: this.progress.bank,
      bestStreak: this.bestStreak,
      catchesThisLevel: this.catchesThisLevel,
      levelProgress: progress01,
    };

    this.setPhase('gameover');
    this.callbacks.onRunSummary(summary);
    this.emitHud(true);
  }

  private spawnBurst(x: number, y: number, color: string, count: number, maxSpeed: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % PARTICLE_POOL_SIZE;
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const speed = maxSpeed * (0.35 + Math.random() * 0.65);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - 25;
      p.size = 1.8 + Math.random() * 3.2;
      p.life = 0;
      p.maxLife = 0.28 + Math.random() * 0.34;
      p.color = color;
      p.glow = i % 2 === 0;
    }
  }

  private spawnFloater(x: number, y: number, text: string, color: string): void {
    const f = this.floaters[this.floaterCursor];
    this.floaterCursor = (this.floaterCursor + 1) % FLOATING_TEXT_POOL_SIZE;
    f.active = true;
    f.x = x;
    f.y = y;
    f.vy = -56;
    f.text = text;
    f.color = color;
    f.life = 0;
    f.maxLife = 0.78;
  }

  private updateParticles(dt: number): void {
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-3.4 * dt);
      p.vy *= Math.exp(-2.8 * dt);
    }
  }

  private updateFloaters(dt: number): void {
    for (let i = 0; i < FLOATING_TEXT_POOL_SIZE; i++) {
      const f = this.floaters[i];
      if (!f.active) continue;
      f.life += dt;
      if (f.life >= f.maxLife) {
        f.active = false;
        continue;
      }
      f.y += f.vy * dt;
      f.vy *= Math.exp(-2.2 * dt);
    }
  }

  private emitHud(force: boolean): void {
    const progress01 = Math.min(1, this.levelElapsed / Math.max(1, this.levelDuration));
    const colorDef = LANTERN_COLOR_MAP[this.progress.equippedColor];
    const ghostCharge01 = !colorDef.hasGhost
      ? 0
      : this.ghostActiveTimer > 0
        ? this.ghostActiveTimer / colorDef.ghostDurationSec
        : this.ghostCooldownTimer > 0
          ? 1 - this.ghostCooldownTimer / colorDef.ghostCooldownSec
          : 1;

    const snapshot: HudSnapshot = {
      phase: this.phase,
      level: this.level,
      hearts: this.hearts,
      maxHearts: this.maxHearts,
      lastDamagedHeartIndex: this.lastDamagedHeartIndex,
      damageFlashMs: Math.round(this.damageFlashTimer * 1000),
      bank: this.progress.bank,
      runGold: this.runGold,
      levelGold: this.levelGold,
      streak: this.streak,
      levelProgress: progress01,
      paceZone: getPaceZone(progress01),
      speedMultiplier: getLevelSpeedMultiplier(
        this.level,
        progress01,
        this.progress.helpers.starlight_compass
      ),
      equippedColor: this.progress.equippedColor,
      shieldReady: colorDef.hasShield && this.shieldCharge >= 1,
      shieldCharge01: this.shieldCharge,
      ghostActive: this.ghostActiveTimer > 0,
      ghostReady: colorDef.hasGhost && this.ghostActiveTimer <= 0 && this.ghostCooldownTimer <= 0,
      ghostCharge01,
      muted: this.audio.isMuted(),
    };

    if (force || this.phase === 'playing') {
      this.callbacks.onHudUpdate(snapshot);
    }
  }

  // =========================================================================
  // RENDERING (Pre-cached backdrop & glow stamps for silky 60fps everywhere)
  // =========================================================================

  private render(): void {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.save();

    if (this.trauma > 0.001) {
      const shake = this.trauma * this.trauma * 14;
      const ox = (Math.random() - 0.5) * 2 * shake;
      const oy = (Math.random() - 0.5) * 2 * shake;
      ctx.translate(ox, oy);
    }

    // 1. Pre-rendered deep space + cosmic nebula backdrop
    ctx.drawImage(this.bgCanvas, 0, 0, w, h);

    // 2. Parallax stars
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      const twinkle = 0.62 + 0.38 * Math.sin(this.worldTime * 2.2 + s.twinklePhase);
      ctx.globalAlpha = s.alpha * twinkle;
      ctx.fillStyle = s.tint;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 3. Celestial Lantern Lane guide rails
    this.drawLaneGuides(ctx, h);

    // 4. Ambient drifting lanterns on title screen (kept out of central title lockup negative space)
    if (this.phase === 'title') {
      for (let i = 0; i < this.ambient.length; i++) {
        const a = this.ambient[i];
        const x = a.x + Math.sin(this.worldTime * 0.8 + a.swayPhase) * 18;
        const inTitleSafeZone =
          Math.abs(x - w * 0.5) < Math.min(240, w * 0.32) &&
          a.y > h * 0.2 &&
          a.y < h * 0.66;
        ctx.save();
        ctx.globalAlpha = inTitleSafeZone ? 0.14 : 0.52;
        if (a.isPurple) {
          this.drawPurpleLantern(ctx, x, a.y, 14 * a.scale, 'purple_drop', 0);
        } else {
          this.drawGoldLantern(ctx, x, a.y, 14 * a.scale, false);
        }
        ctx.restore();
      }
    }

    // 5. Magnet field & attraction threads
    const colorDef = LANTERN_COLOR_MAP[this.progress.equippedColor];
    if (this.phase === 'playing' && colorDef.hasMagnet) {
      this.drawMagnetField(ctx, colorDef.magnetRadius);
    }

    // 6. Falling gold & purple lanterns + purple top-edge entry telegraphs
    if (this.phase !== 'title') {
      for (let i = 0; i < this.falling.length; i++) {
        const item = this.falling[i];
        if (item.telegraphTime > 0) {
          this.drawPurpleTelegraph(ctx, item.x, item.telegraphTime, item.kind);
          continue;
        }
        ctx.save();
        if (item.caughtOrHit) {
          ctx.globalAlpha = Math.max(0, 1 - item.fadeOut);
          const popScale = 1 + item.fadeOut * 0.35;
          ctx.translate(item.x, item.y);
          ctx.scale(popScale, popScale);
          ctx.translate(-item.x, -item.y);
        }
        if (item.kind === 'gold' || item.kind === 'radiant') {
          this.drawGoldLantern(ctx, item.x, item.y, item.radius, item.kind === 'radiant');
        } else {
          this.drawPurpleLantern(ctx, item.x, item.y, item.radius, item.kind, item.age);
        }
        ctx.restore();
      }
    }

    // 7. Player motion trail
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      ctx.save();
      ctx.globalAlpha = t.alpha * 0.35;
      ctx.fillStyle = colorDef.accentHex;
      ctx.beginPath();
      ctx.ellipse(t.x, t.y, 16, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 8. Player glowing lantern
    this.drawPlayerLantern(ctx);

    // 9. Pooled particles
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      const t = 1 - p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, t);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * t), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 10. Floating score / power cues
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 15px "JetBrains Mono", monospace';
    for (let i = 0; i < FLOATING_TEXT_POOL_SIZE; i++) {
      const f = this.floaters[i];
      if (!f.active) continue;
      const t = 1 - f.life / f.maxLife;
      ctx.globalAlpha = Math.min(1, t * 1.4);
      ctx.fillStyle = 'rgba(6, 8, 22, 0.85)';
      ctx.fillText(f.text, f.x + 1, f.y + 1.5);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    // 11. Subtle peripheral crimson vignette on low hearts or recent damage
    if (this.phase === 'playing' && (this.hearts === 1 || this.damageFlashTimer > 0)) {
      const lowAlpha = this.hearts === 1 ? 0.14 + 0.06 * Math.sin(this.worldTime * 4.5) : 0;
      const dmgAlpha = this.damageFlashTimer > 0 ? (this.damageFlashTimer / 0.45) * 0.28 : 0;
      const vAlpha = Math.min(0.4, lowAlpha + dmgAlpha);
      ctx.strokeStyle = `rgba(190, 24, 93, ${vAlpha.toFixed(3)})`;
      ctx.lineWidth = Math.max(24, Math.min(w, h) * 0.06);
      ctx.strokeRect(0, 0, w, h);
    }

    ctx.restore();
  }

  private drawGlow(ctx: CanvasRenderingContext2D, key: string, radius: number): void {
    const stamp = this.glowStamps[key] || this.glowStamps.gold;
    if (stamp) {
      ctx.drawImage(stamp, -radius, -radius, radius * 2, radius * 2);
    }
  }

  private drawLaneGuides(ctx: CanvasRenderingContext2D, h: number): void {
    const isPlaying = this.phase === 'playing';
    const progress01 = Math.min(1, this.levelElapsed / Math.max(1, this.levelDuration));
    const paceZone = getPaceZone(progress01);

    ctx.strokeStyle =
      isPlaying && paceZone === 'peak'
        ? 'rgba(251, 191, 36, 0.22)'
        : 'rgba(251, 191, 36, 0.11)';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.moveTo(this.laneLeft, 0);
    ctx.lineTo(this.laneLeft, h);
    ctx.moveTo(this.laneRight, 0);
    ctx.lineTo(this.laneRight, h);
    ctx.stroke();

    if (isPlaying) {
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this.laneLeft + 24, this.playerY + 26);
      ctx.lineTo(this.laneRight - 24, this.playerY + 26);
      ctx.stroke();
    }
  }

  private drawMagnetField(ctx: CanvasRenderingContext2D, radius: number): void {
    const pulse = 0.85 + 0.15 * Math.sin(this.worldTime * 4);
    ctx.save();
    ctx.strokeStyle = `rgba(56, 189, 248, ${(0.2 * pulse).toFixed(3)})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.arc(this.playerX, this.playerY, radius, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    ctx.setLineDash([]);

    for (let i = 0; i < this.falling.length; i++) {
      const item = this.falling[i];
      if (item.caughtOrHit || (item.kind !== 'gold' && item.kind !== 'radiant')) continue;
      const dx = this.playerX - item.x;
      const dy = this.playerY - item.y;
      const dist = Math.hypot(dx, dy);
      if (dist < radius) {
        const strength = 1 - dist / radius;
        ctx.strokeStyle = `rgba(125, 211, 252, ${(0.48 * strength).toFixed(3)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(this.playerX, this.playerY - 8);
        ctx.lineTo(item.x, item.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawPurpleTelegraph(
    ctx: CanvasRenderingContext2D,
    x: number,
    remaining: number,
    kind: LanternKind
  ): void {
    const pulse = 0.55 + 0.45 * Math.sin(this.worldTime * 22);
    ctx.save();
    ctx.strokeStyle = `rgba(192, 132, 252, ${(0.42 * pulse).toFixed(3)})`;
    ctx.lineWidth = kind === 'purple_seeker' ? 2.5 : 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 105);
    ctx.stroke();

    const size = 8 + (1 - Math.min(1, remaining / 0.5)) * 4;
    ctx.fillStyle = '#d8b4fe';
    ctx.beginPath();
    ctx.moveTo(x, 8 + size);
    ctx.lineTo(x - size * 0.7, 8);
    ctx.lineTo(x, 8 - size * 0.45);
    ctx.lineTo(x + size * 0.7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawGoldLantern(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    isRadiant: boolean
  ): void {
    ctx.save();
    ctx.translate(x, y);

    this.drawGlow(ctx, isRadiant ? 'radiant' : 'gold', r * (isRadiant ? 2.3 : 1.85));

    ctx.fillStyle = isRadiant ? '#fde047' : '#fbbf24';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.82, r, 0, 0, Math.PI * 2);
    ctx.fill();

    // Inner bright core
    ctx.fillStyle = '#fffbeb';
    ctx.beginPath();
    ctx.ellipse(-r * 0.1, -r * 0.1, r * 0.42, r * 0.56, 0, 0, Math.PI * 2);
    ctx.fill();

    // Delicate lantern ribs
    ctx.strokeStyle = 'rgba(146, 64, 14, 0.46)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.42, r * 0.98, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Brass caps
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-r * 0.42, -r * 1.08, r * 0.84, r * 0.2);
    ctx.fillRect(-r * 0.36, r * 0.9, r * 0.72, r * 0.18);

    // Tassel
    ctx.strokeStyle = isRadiant ? '#fef08a' : '#f59e0b';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, r * 1.08);
    ctx.lineTo(0, r * 1.48);
    ctx.stroke();

    if (isRadiant) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-r * 0.32, 0);
      ctx.lineTo(r * 0.32, 0);
      ctx.moveTo(0, -r * 0.32);
      ctx.lineTo(0, r * 0.32);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawPurpleLantern(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    kind: LanternKind,
    age: number
  ): void {
    ctx.save();
    ctx.translate(x, y);

    const wobble = kind === 'purple_sway' ? Math.sin(age * 6) * 0.14 : 0;
    ctx.rotate(wobble);

    this.drawGlow(ctx, 'purple', r * 1.85);

    ctx.fillStyle = '#9333ea';
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.15);
    ctx.lineTo(r * 0.88, -r * 0.35);
    ctx.lineTo(r * 0.72, r * 0.75);
    ctx.lineTo(0, r * 1.15);
    ctx.lineTo(-r * 0.72, r * 0.75);
    ctx.lineTo(-r * 0.88, -r * 0.35);
    ctx.closePath();
    ctx.fill();

    // Bright violet core
    ctx.fillStyle = '#e9d5ff';
    ctx.beginPath();
    ctx.arc(0, -r * 0.05, r * 0.38, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#e9d5ff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.15);
    ctx.lineTo(r * 0.88, -r * 0.35);
    ctx.lineTo(r * 0.72, r * 0.75);
    ctx.lineTo(0, r * 1.15);
    ctx.lineTo(-r * 0.72, r * 0.75);
    ctx.lineTo(-r * 0.88, -r * 0.35);
    ctx.closePath();
    ctx.stroke();

    // Inner X hazard sigil
    ctx.strokeStyle = 'rgba(59, 7, 100, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r * 0.32, -r * 0.25);
    ctx.lineTo(r * 0.32, r * 0.35);
    ctx.moveTo(r * 0.32, -r * 0.25);
    ctx.lineTo(-r * 0.32, r * 0.35);
    ctx.stroke();

    if (kind === 'purple_seeker') {
      ctx.strokeStyle = 'rgba(233, 213, 255, 0.8)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.25, age * 4, age * 4 + Math.PI * 1.2);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawPlayerLantern(ctx: CanvasRenderingContext2D): void {
    const colorDef = LANTERN_COLOR_MAP[this.progress.equippedColor];
    const isGhosting = this.ghostActiveTimer > 0;
    const isBlinking =
      this.invulnTimer > 0 &&
      this.phase === 'playing' &&
      Math.floor(this.invulnTimer * 14) % 2 === 0;

    ctx.save();
    ctx.translate(this.playerX, this.playerY);
    ctx.rotate(this.playerTilt);
    ctx.scale(this.squashX, this.squashY);

    if (isGhosting) {
      ctx.globalAlpha = 0.48 + 0.16 * Math.sin(this.worldTime * 16);
    } else if (isBlinking) {
      ctx.globalAlpha = 0.45;
    }

    const r = PLAYER_RADIUS;

    this.drawGlow(ctx, this.hitFlashTimer > 0 ? 'flash' : colorDef.id, r * 2.45);

    ctx.fillStyle = this.hitFlashTimer > 0 ? '#ffffff' : colorDef.accentHex;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.92, r * 1.06, 0, 0, Math.PI * 2);
    ctx.fill();

    // Inner bright gradient-like highlight
    ctx.fillStyle = this.hitFlashTimer > 0 ? '#ffffff' : colorDef.bodyCore;
    ctx.beginPath();
    ctx.ellipse(-r * 0.1, -r * 0.14, r * 0.54, r * 0.68, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ornate curved ribs
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.36)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.48, r * 1.04, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Inner incandescent filament diamond
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.34);
    ctx.lineTo(r * 0.18, 0);
    ctx.lineTo(0, r * 0.34);
    ctx.lineTo(-r * 0.18, 0);
    ctx.closePath();
    ctx.fill();

    // Top crown & handle ring
    ctx.fillStyle = '#1e1b2e';
    ctx.strokeStyle = colorDef.trimColor;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(-r * 0.5, -r * 1.18, r, r * 0.24, 3);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, -r * 1.32, r * 0.18, Math.PI, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(-r * 0.44, r * 0.95, r * 0.88, r * 0.22, 3);
    ctx.fill();
    ctx.stroke();

    const tasselLag = -this.playerTilt * 18;
    ctx.strokeStyle = colorDef.accentHex;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, r * 1.17);
    ctx.quadraticCurveTo(tasselLag * 0.5, r * 1.46, tasselLag, r * 1.72);
    ctx.stroke();

    // Diegetic on-lantern power ring
    ctx.globalAlpha = 1;
    if (colorDef.hasShield) {
      if (this.shieldCharge >= 1) {
        ctx.strokeStyle = 'rgba(110, 231, 183, 0.88)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.48, 0, Math.PI * 2);
        ctx.stroke();
      } else if (this.phase === 'playing') {
        ctx.strokeStyle = 'rgba(52, 211, 153, 0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.44, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(110, 231, 183, 0.9)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(
          0,
          0,
          r * 1.44,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * this.shieldCharge
        );
        ctx.stroke();
      }
    } else if (colorDef.hasGhost && this.phase === 'playing') {
      if (this.ghostActiveTimer > 0) {
        const frac = this.ghostActiveTimer / colorDef.ghostDurationSec;
        ctx.strokeStyle = 'rgba(241, 245, 249, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (this.ghostCooldownTimer > 0) {
        const frac = 1 - this.ghostCooldownTimer / colorDef.ghostCooldownSec;
        ctx.strokeStyle = 'rgba(203, 213, 225, 0.45)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.44, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}
