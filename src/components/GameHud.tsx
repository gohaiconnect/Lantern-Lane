import React from 'react';
import { LANTERN_COLOR_MAP } from '../game/catalog';
import type { HudSnapshot, RunSummary } from '../game/types';
import { GoldLanternIcon, HeartSocketIcon, PauseIcon, SoundIcon } from './HudIcons';

interface GameHudProps {
  hud: HudSnapshot;
  summary: RunSummary | null;
  progressBarRef: React.RefObject<HTMLDivElement | null>;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
  onNextLevel: () => void;
  onReturnTitle: () => void;
  onOpenShop: () => void;
  onToggleMute: () => void;
  onTriggerGhost: () => void;
}

const PACE_LABELS: Record<HudSnapshot['paceZone'], string> = {
  rising: 'Brisk Start',
  peak: 'Peak Surge',
  easing: 'Calming Finish',
};

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  summary,
  progressBarRef,
  onPause,
  onResume,
  onRestart,
  onNextLevel,
  onReturnTitle,
  onOpenShop,
  onToggleMute,
  onTriggerGhost,
}) => {
  const colorDef = LANTERN_COLOR_MAP[hud.equippedColor];
  const isPlaying = hud.phase === 'playing';
  const showActiveHud = hud.phase === 'playing' || hud.phase === 'paused';

  return (
    <>
      {/* Active Play Perimeter HUD (pointer-events: none wrapper, zero backdrop-filter) */}
      {showActiveHud && (
        <div
          className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3.5 sm:p-5"
          aria-label="Game Heads-Up Display"
        >
          <div className="w-full flex items-start justify-between gap-3">
            {/* Top-Left Cluster: Vitality Heart Sockets + Equipped Power */}
            <div className="flex flex-col gap-1.5">
              <div
                className="flex items-center gap-1"
                aria-label={`Hearts: ${hud.hearts} of ${hud.maxHearts}`}
              >
                {Array.from({ length: hud.maxHearts }).map((_, idx) => {
                  const state =
                    idx < hud.hearts
                      ? 'full'
                      : idx === hud.lastDamagedHeartIndex && hud.damageFlashMs > 0
                        ? 'cracked'
                        : 'empty';
                  return <HeartSocketIcon key={idx} state={state} size={23} />;
                })}
              </div>

              {/* Active Power Readout (only shown for special power colors) */}
              {colorDef.hasShield && (
                <div className="text-[11px] font-medium tracking-wide text-emerald-200/90 hud-stroke">
                  {hud.shieldReady
                    ? 'Aegis Shield · Ready'
                    : `Aegis Shield · ${Math.round(hud.shieldCharge01 * 100)}%`}
                </div>
              )}
              {colorDef.hasMagnet && (
                <div className="text-[11px] font-medium tracking-wide text-sky-200/90 hud-stroke">
                  Gold Magnet · Active
                </div>
              )}
              {colorDef.hasGhost && (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onTriggerGhost();
                  }}
                  disabled={!hud.ghostReady}
                  className={`pointer-events-auto self-start mt-0.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide transition-colors ${
                    hud.ghostActive
                      ? 'bg-slate-100 text-slate-950'
                      : hud.ghostReady
                        ? 'bg-[#1a2248]/90 text-slate-100 border border-slate-200/35 hover:bg-[#253063] cursor-pointer'
                        : 'bg-[#10152e]/80 text-slate-300/60 border border-slate-300/15'
                  }`}
                >
                  {hud.ghostActive
                    ? 'Ghost Active'
                    : hud.ghostReady
                      ? 'Ghost [Space] · Ready'
                      : `Ghost · ${Math.round(hud.ghostCharge01 * 100)}%`}
                </button>
              )}
              {colorDef.streakBonusEvery > 0 && hud.streak > 0 && (
                <div className="text-[11px] font-mono-num text-rose-200/90 hud-stroke">
                  Comet Streak {hud.streak}
                </div>
              )}
            </div>

            {/* Top-Center Cluster: Level & Rhythmic Pace Arc */}
            <div className="flex flex-col items-center w-[170px] sm:w-[250px] pt-0.5">
              <div className="w-full flex items-baseline justify-between text-[11px] sm:text-xs hud-stroke">
                <span className="font-semibold tracking-wider text-amber-100 uppercase">
                  Level {hud.level}
                </span>
                <span
                  className={`font-medium ${
                    hud.paceZone === 'peak'
                      ? 'text-amber-300'
                      : hud.paceZone === 'easing'
                        ? 'text-emerald-300'
                        : 'text-amber-100/80'
                  }`}
                >
                  {PACE_LABELS[hud.paceZone]}
                </span>
              </div>

              {/* Hairline progress rail with bell-curve midpoint tick */}
              <div className="relative w-full h-2 mt-1.5 rounded-full bg-[#090d22]/90 border border-amber-200/20 overflow-hidden">
                {/* Midpoint peak marker */}
                <div
                  aria-hidden="true"
                  className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-0.5 bg-amber-200/45 z-10"
                />
                <div
                  ref={progressBarRef}
                  className="h-full w-full origin-left rounded-full bg-amber-400 will-change-transform"
                  style={{ transform: `scaleX(${hud.levelProgress.toFixed(4)})` }}
                />
              </div>
            </div>

            {/* Top-Right Cluster: Lantern Bank + Mute / Pause Square Utility Buttons */}
            <div className="flex items-center gap-2 sm:gap-2.5">
              <div
                className="flex items-center gap-1.5 mr-1 hud-stroke"
                aria-label={`Lantern Bank: ${hud.bank} gold lanterns`}
              >
                <GoldLanternIcon size={21} />
                <div className="flex flex-col items-end leading-none">
                  <span className="font-mono-num text-lg sm:text-xl font-bold text-amber-200">
                    {Math.round(hud.bank)}
                  </span>
                  <span className="text-[10px] tracking-wider uppercase text-amber-100/65">
                    Bank
                  </span>
                </div>
              </div>

              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleMute();
                }}
                aria-label={hud.muted ? 'Unmute audio' : 'Mute audio'}
                title="Mute [M]"
                className="pointer-events-auto w-10 h-10 flex items-center justify-center rounded-lg bg-[#121836]/90 hover:bg-[#1c2450] text-amber-100 border border-amber-200/20 transition-colors cursor-pointer"
              >
                <SoundIcon muted={hud.muted} />
              </button>

              {isPlaying && (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onPause();
                  }}
                  aria-label="Pause game"
                  title="Pause [Esc]"
                  className="pointer-events-auto w-10 h-10 flex items-center justify-center rounded-lg bg-[#121836]/90 hover:bg-[#1c2450] text-amber-100 border border-amber-200/20 transition-colors cursor-pointer"
                >
                  <PauseIcon />
                </button>
              )}
            </div>
          </div>

          {/* Quiet bottom streak counter when active */}
          <div className="flex justify-center">
            {hud.streak >= 3 && (
              <div className="text-xs font-mono-num text-amber-200/85 hud-stroke">
                {hud.streak} catch streak
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pause Modal */}
      {hud.phase === 'paused' && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#050714]/78"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pause-heading"
        >
          <div className="animate-modal-enter w-full max-w-sm rounded-2xl bg-[#0e132c] border border-amber-300/25 p-6 text-center shadow-[0_24px_60px_rgba(0,0,0,0.65)]">
            <h2 id="pause-heading" className="font-display text-3xl font-bold text-amber-50">
              Paused
            </h2>
            <p className="mt-1.5 text-sm text-amber-100/70">
              Level {hud.level} · {hud.hearts} of {hud.maxHearts} Hearts · {hud.bank} Bank
            </p>

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onResume}
                className="min-h-[44px] w-full px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-base transition-colors cursor-pointer"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={onRestart}
                className="min-h-[44px] w-full px-5 py-2.5 rounded-xl bg-[#192045] hover:bg-[#232c5c] text-amber-100 font-medium text-sm transition-colors cursor-pointer"
              >
                Restart Run
              </button>
              <button
                type="button"
                onClick={onReturnTitle}
                className="min-h-[44px] w-full px-5 py-2.5 rounded-xl bg-transparent hover:bg-[#161c3d] text-amber-100/80 font-medium text-sm transition-colors cursor-pointer"
              >
                Title Screen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Level Clear Modal */}
      {hud.phase === 'levelclear' && summary && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#050714]/80"
          role="dialog"
          aria-modal="true"
          aria-labelledby="levelclear-heading"
        >
          <div className="animate-modal-enter w-full max-w-md rounded-2xl bg-[#0e132c] border border-amber-300/35 p-6 sm:p-7 text-center shadow-[0_24px_65px_rgba(0,0,0,0.68)]">
            <h2 id="levelclear-heading" className="font-display text-3xl font-bold text-amber-200">
              Level {summary.level} Cleared
            </h2>
            <p className="mt-1.5 text-sm text-emerald-300 font-medium">
              {summary.heartEarned
                ? `+1 Extra Heart Earned (${summary.heartsAfter}/${summary.maxHeartsAfter} Hearts)`
                : `Hearts Full (${summary.heartsAfter}/${summary.maxHeartsAfter})`}
            </p>

            <div className="mt-5 grid grid-cols-3 gap-2.5 text-center">
              <div className="rounded-xl bg-[#141a3a] border border-amber-200/10 py-3 px-2">
                <div className="font-mono-num text-xl font-bold text-amber-200">
                  +{summary.levelGold}
                </div>
                <div className="text-[11px] text-amber-100/65 mt-0.5">Caught Gold</div>
              </div>
              <div className="rounded-xl bg-[#141a3a] border border-amber-200/10 py-3 px-2">
                <div className="font-mono-num text-xl font-bold text-amber-300">
                  +{summary.clearBonusGold}
                </div>
                <div className="text-[11px] text-amber-100/65 mt-0.5">Clear Bonus</div>
              </div>
              <div className="rounded-xl bg-[#141a3a] border border-amber-200/10 py-3 px-2">
                <div className="font-mono-num text-xl font-bold text-amber-50">
                  {summary.totalBank}
                </div>
                <div className="text-[11px] text-amber-100/65 mt-0.5">Lantern Bank</div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                data-start="true"
                onClick={onNextLevel}
                className="min-h-[46px] w-full px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-base transition-colors cursor-pointer"
              >
                Next Level (Level {summary.level + 1})
              </button>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={onOpenShop}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-[#192045] hover:bg-[#232c5c] text-amber-100 border border-amber-300/25 font-medium text-sm transition-colors cursor-pointer whitespace-nowrap"
                >
                  Lantern Shop
                </button>
                <button
                  type="button"
                  onClick={onReturnTitle}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-[#141a38] hover:bg-[#1d244d] text-amber-100/80 font-medium text-sm transition-colors cursor-pointer whitespace-nowrap"
                >
                  Title Screen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Game Over Modal */}
      {hud.phase === 'gameover' && summary && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#050714]/82"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gameover-heading"
        >
          <div className="animate-modal-enter w-full max-w-md rounded-2xl bg-[#0e132c] border border-rose-300/25 p-6 sm:p-7 text-center shadow-[0_24px_65px_rgba(0,0,0,0.7)]">
            <h2 id="gameover-heading" className="font-display text-3xl font-bold text-amber-50">
              Lantern Dimmed
            </h2>
            <p className="mt-1.5 text-sm text-amber-100/70">
              Reached Level {summary.level} ({Math.round(summary.levelProgress * 100)}% cleared) — all caught gold stays in your bank.
            </p>

            <div className="mt-5 grid grid-cols-3 gap-2.5 text-center">
              <div className="rounded-xl bg-[#141a3a] border border-amber-200/10 py-3 px-2">
                <div className="font-mono-num text-xl font-bold text-amber-100">
                  Lv {summary.level}
                </div>
                <div className="text-[11px] text-amber-100/65 mt-0.5">Reached</div>
              </div>
              <div className="rounded-xl bg-[#141a3a] border border-amber-200/10 py-3 px-2">
                <div className="font-mono-num text-xl font-bold text-amber-200">
                  {summary.bestStreak}
                </div>
                <div className="text-[11px] text-amber-100/65 mt-0.5">Best Streak</div>
              </div>
              <div className="rounded-xl bg-[#141a3a] border border-amber-200/10 py-3 px-2">
                <div className="font-mono-num text-xl font-bold text-amber-300">
                  {summary.totalBank}
                </div>
                <div className="text-[11px] text-amber-100/65 mt-0.5">Lantern Bank</div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                data-start="true"
                onClick={onRestart}
                className="min-h-[46px] w-full px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-base transition-colors cursor-pointer"
              >
                Try Again
              </button>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={onOpenShop}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-[#192045] hover:bg-[#232c5c] text-amber-100 border border-amber-300/25 font-medium text-sm transition-colors cursor-pointer whitespace-nowrap"
                >
                  Lantern Shop
                </button>
                <button
                  type="button"
                  onClick={onReturnTitle}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-[#141a38] hover:bg-[#1d244d] text-amber-100/80 font-medium text-sm transition-colors cursor-pointer whitespace-nowrap"
                >
                  Title Screen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
