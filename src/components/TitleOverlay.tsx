import React from 'react';
import { LANTERN_COLOR_MAP } from '../game/catalog';
import { getStartingHearts } from '../game/rules';
import type { PersistentProgress } from '../game/types';
import { GoldLanternIcon, TitleEmblemSvg } from './HudIcons';

interface TitleOverlayProps {
  progress: PersistentProgress;
  onStart: () => void;
  onOpenShop: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  progress,
  onStart,
  onOpenShop,
}) => {
  const equipped = LANTERN_COLOR_MAP[progress.equippedColor];
  const startingHearts = getStartingHearts(progress);

  return (
    <div
      className="fixed inset-0 z-20 flex flex-col items-center justify-between px-6 py-7 sm:py-10 pointer-events-none"
      aria-label="Lantern Lane Title Screen"
    >
      {/* Top quiet utility strip: bank & best level as clean unboxed typography */}
      <div className="w-full max-w-4xl flex items-center justify-between text-xs sm:text-sm text-amber-100/80 hud-stroke">
        <div className="flex items-center gap-2 font-mono-num">
          <GoldLanternIcon size={18} />
          <span className="font-semibold text-amber-200">{progress.bank}</span>
          <span className="text-amber-100/60">in bank</span>
        </div>
        <div className="flex items-center gap-2.5 text-amber-100/75">
          <span>{equipped.name}</span>
          <span aria-hidden="true">·</span>
          <span>{startingHearts} Hearts</span>
          {progress.bestLevel > 1 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num">Best Lv {progress.bestLevel}</span>
            </>
          )}
        </div>
      </div>

      {/* Center-upper negative-space Title Lockup + Primary CTA */}
      <div className="flex flex-col items-center text-center max-w-md -mt-8 sm:-mt-12 pointer-events-auto">
        <TitleEmblemSvg />

        <p className="mt-2.5 text-sm sm:text-base text-amber-50/85 max-w-sm leading-relaxed hud-stroke">
          Catch falling gold lanterns for your bank and dodge the purple void lanterns as each level surges and calms.
        </p>

        <div className="mt-7 flex items-center gap-3.5">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStart();
            }}
            className="min-h-[46px] px-8 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 active:scale-[0.98] text-slate-950 font-semibold text-base tracking-wide shadow-[0_6px_28px_rgba(251,191,36,0.34)] transition-[transform,background-color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 cursor-pointer whitespace-nowrap shrink-0"
          >
            Play
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenShop();
            }}
            className="min-h-[46px] px-6 py-3 rounded-xl bg-[#141937]/92 hover:bg-[#1c234a] active:scale-[0.98] text-amber-100 border border-amber-300/30 font-medium text-base transition-[transform,background-color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 cursor-pointer whitespace-nowrap shrink-0"
          >
            Lantern Shop
          </button>
        </div>
      </div>

      {/* Single flat, borderless control-hint line in bottom safe margin */}
      <div className="text-xs sm:text-[13px] text-amber-100/70 tracking-wide text-center hud-stroke">
        ← / → or A / D or Drag to Slide · Space Ghost Power · Esc Pause · M Mute
      </div>
    </div>
  );
};
