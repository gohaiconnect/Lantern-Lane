import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { ShopModal } from './components/ShopModal';
import { TitleOverlay } from './components/TitleOverlay';
import { LanternAudio } from './game/audio';
import { LANTERN_COLOR_MAP } from './game/catalog';
import { LanternLaneEngine } from './game/engine';
import {
  buyHelperUpgrade,
  buyLanternColor,
  equipLanternColor,
  getStartingHearts,
  loadProgress,
  saveProgress,
} from './game/rules';
import type {
  GamePhase,
  HelperId,
  HudSnapshot,
  LanternColorId,
  PersistentProgress,
  RunSummary,
} from './game/types';

function createInitialHud(progress: PersistentProgress): HudSnapshot {
  const startHearts = getStartingHearts(progress);
  const colorDef = LANTERN_COLOR_MAP[progress.equippedColor];
  const hasPower = colorDef.powerType !== 'none';
  return {
    phase: 'title',
    level: 1,
    hearts: startHearts,
    maxHearts: startHearts,
    lastDamagedHeartIndex: -1,
    damageFlashMs: 0,
    bank: progress.bank,
    runGold: 0,
    levelGold: 0,
    streak: 0,
    levelProgress: 0,
    paceZone: 'rising',
    speedMultiplier: 1.12,
    equippedColor: progress.equippedColor,
    powerState: hasPower ? 'ready' : 'none',
    powerRemainingSec: 0,
    powerDurationSec: colorDef.powerDurationSec,
    powerCharge01: hasPower ? 1 : 0,
    muted: false,
  };
}

export default function App() {
  const [progress, setProgress] = useState<PersistentProgress>(() =>
    loadProgress(typeof window !== 'undefined' ? window.localStorage : undefined)
  );
  const [hud, setHud] = useState<HudSnapshot>(() => createInitialHud(progress));
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [shopOpen, setShopOpen] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<LanternLaneEngine | null>(null);
  const audioRef = useRef<LanternAudio | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const phaseRef = useRef<GamePhase>('title');
  const shopOpenRef = useRef(false);
  const initialProgressRef = useRef(progress);

  shopOpenRef.current = shopOpen;

  // Mount Canvas & Simulation Engine ONCE so React HUD updates never tear down the game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const audio = new LanternAudio();
    audioRef.current = audio;
    document.body.dataset.state = 'title';

    const engine = new LanternLaneEngine(canvas, initialProgressRef.current, audio, {
      onHudUpdate: (snapshot) => {
        setHud(snapshot);
      },
      onProgressChange: (next) => {
        setProgress(next);
        saveProgress(next, window.localStorage);
      },
      onRunSummary: (nextSummary) => {
        setSummary(nextSummary);
      },
      onPhaseChange: (nextPhase) => {
        phaseRef.current = nextPhase;
      },
    });

    engineRef.current = engine;
    engine.bindDirectDomRefs(progressBarRef.current);

    // Support ?autostart=1 for instant gameplay boot without triggering audio autoplay warning
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      engine.startNewRun(false);
    }

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Rebind direct progress bar ref whenever HUD mounts/remounts across phase transitions
  useEffect(() => {
    engineRef.current?.bindDirectDomRefs(progressBarRef.current);
  }, [hud.phase]);

  // Pause canvas repaints cleanly while Shop modal is open
  useEffect(() => {
    engineRef.current?.setModalOpen(shopOpen);
  }, [shopOpen]);

  // Title-to-Start handshake via Enter / Space (and Enter on Level Clear / Game Over)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (shopOpenRef.current) return;
      if (e.repeat) return;

      const phase = phaseRef.current;
      if (phase === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur?.();
        engineRef.current?.startNewRun();
      } else if (phase === 'levelclear' && e.code === 'Enter') {
        e.preventDefault();
        engineRef.current?.startNextLevel();
      } else if (phase === 'gameover' && e.code === 'Enter') {
        e.preventDefault();
        engineRef.current?.restartCurrentRun();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleStart = useCallback(() => {
    setShopOpen(false);
    engineRef.current?.startNewRun();
  }, []);

  const handleNextLevel = useCallback(() => {
    setShopOpen(false);
    engineRef.current?.startNextLevel();
  }, []);

  const handleRestart = useCallback(() => {
    setShopOpen(false);
    engineRef.current?.restartCurrentRun();
  }, []);

  const handlePause = useCallback(() => {
    engineRef.current?.pause();
  }, []);

  const handleResume = useCallback(() => {
    engineRef.current?.resume();
  }, []);

  const handleReturnTitle = useCallback(() => {
    setShopOpen(false);
    engineRef.current?.returnToTitle();
  }, []);

  const handleToggleMute = useCallback(() => {
    engineRef.current?.toggleMute();
  }, []);

  const handleTriggerPower = useCallback(() => {
    engineRef.current?.triggerActivePower();
  }, []);

  const handleBuyOrEquipColor = useCallback(
    (colorId: LanternColorId) => {
      setProgress((prev) => {
        const alreadyOwned = prev.unlockedColors.includes(colorId);
        const result = alreadyOwned
          ? equipLanternColor(prev, colorId)
          : buyLanternColor(prev, colorId);
        if (!result.ok) return prev;
        if (!alreadyOwned) {
          audioRef.current?.playShopPurchase();
        }
        saveProgress(result.progress, window.localStorage);
        engineRef.current?.syncProgress(result.progress);
        return result.progress;
      });
    },
    []
  );

  const handleBuyHelper = useCallback((helperId: HelperId) => {
    setProgress((prev) => {
      const result = buyHelperUpgrade(prev, helperId);
      if (!result.ok) return prev;
      audioRef.current?.playShopPurchase();
      saveProgress(result.progress, window.localStorage);
      engineRef.current?.syncProgress(result.progress);
      return result.progress;
    });
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#060816]">
      {/* Isolated full-viewport game canvas container */}
      <div className="fixed inset-0 z-0">
        <canvas
          ref={canvasRef}
          data-testid="lantern-canvas"
          className="block w-full h-full cursor-move"
          aria-label="Lantern Lane game playfield"
        />
      </div>

      {/* Title Screen */}
      {hud.phase === 'title' && !shopOpen && (
        <TitleOverlay
          progress={progress}
          onStart={handleStart}
          onOpenShop={() => setShopOpen(true)}
        />
      )}

      {/* Active HUD & Status Modals */}
      <GameHud
        hud={hud}
        summary={summary}
        progressBarRef={progressBarRef}
        onPause={handlePause}
        onResume={handleResume}
        onRestart={handleRestart}
        onNextLevel={handleNextLevel}
        onReturnTitle={handleReturnTitle}
        onOpenShop={() => setShopOpen(true)}
        onToggleMute={handleToggleMute}
        onTriggerPower={handleTriggerPower}
      />

      {/* Lantern Shop Modal */}
      {shopOpen && (
        <ShopModal
          progress={progress}
          onBuyOrEquipColor={handleBuyOrEquipColor}
          onBuyHelper={handleBuyHelper}
          onClose={() => setShopOpen(false)}
        />
      )}
    </main>
  );
}
