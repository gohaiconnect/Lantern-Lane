import React, { useEffect, useState } from 'react';
import { LANTERN_COLORS, SHOP_HELPERS } from '../game/catalog';
import { getHelperNextCost } from '../game/rules';
import type { HelperId, LanternColorId, PersistentProgress } from '../game/types';
import { GoldLanternIcon, MiniLanternPreview } from './HudIcons';

interface ShopModalProps {
  progress: PersistentProgress;
  onBuyOrEquipColor: (id: LanternColorId) => void;
  onBuyHelper: (id: HelperId) => void;
  onClose: () => void;
}

export const ShopModal: React.FC<ShopModalProps> = ({
  progress,
  onBuyOrEquipColor,
  onBuyHelper,
  onClose,
}) => {
  const [tab, setTab] = useState<'colors' | 'helpers'>('colors');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6 bg-[#050714]/82"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shop-title"
    >
      <div className="animate-modal-enter w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl bg-[#0e132c] border border-amber-300/25 shadow-[0_24px_70px_rgba(0,0,0,0.65)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-5 sm:px-6 py-4 border-b border-amber-200/12">
          <div>
            <h2 id="shop-title" className="font-display text-2xl font-bold text-amber-50">
              Lantern Shop
            </h2>
            <p className="text-xs sm:text-sm text-amber-100/65 mt-0.5">
              Spend gold lanterns from your bank on powered colors and run helpers.
            </p>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#171e42] border border-amber-300/25"
              aria-label={`Lantern bank balance: ${progress.bank} gold lanterns`}
            >
              <GoldLanternIcon size={18} />
              <span className="font-mono-num text-base font-bold text-amber-200">
                {progress.bank}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Lantern Shop"
              className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[#192045] hover:bg-[#232c5c] text-amber-100 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              Close
            </button>
          </div>
        </div>

        {/* Interactive Tab Selector */}
        <div className="px-5 sm:px-6 pt-4 pb-2">
          <div
            role="tablist"
            aria-label="Shop categories"
            className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#090d20] border border-amber-200/10"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'colors'}
              onClick={() => setTab('colors')}
              className={`min-h-[38px] px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                tab === 'colors'
                  ? 'bg-amber-400 text-slate-950'
                  : 'text-amber-100/75 hover:text-amber-50'
              }`}
            >
              Lantern Colors &amp; Powers
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'helpers'}
              onClick={() => setTab('helpers')}
              className={`min-h-[38px] px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                tab === 'helpers'
                  ? 'bg-amber-400 text-slate-950'
                  : 'text-amber-100/75 hover:text-amber-50'
              }`}
            >
              Helpers &amp; Rewards
            </button>
          </div>
        </div>

        {/* Scrollable Catalog Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-3 space-y-3">
          {tab === 'colors' ? (
            LANTERN_COLORS.map((item) => {
              const owned = progress.unlockedColors.includes(item.id);
              const equipped = progress.equippedColor === item.id;
              const canAfford = progress.bank >= item.cost;

              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-between gap-4 p-4 rounded-xl border transition-colors ${
                    equipped
                      ? 'bg-[#171f47] border-amber-300/50'
                      : 'bg-[#121735] border-amber-100/10'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="shrink-0">
                      <MiniLanternPreview color={item} size={46} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <h3 className="text-base font-semibold text-amber-50">{item.name}</h3>
                        <span className="text-xs font-medium text-amber-300/90">
                          {item.powerName}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-amber-100/70 mt-0.5 leading-snug">
                        {item.powerSummary}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {equipped ? (
                      <span className="inline-block px-3.5 py-2 text-xs sm:text-sm font-semibold text-emerald-300 whitespace-nowrap">
                        Equipped
                      </span>
                    ) : owned ? (
                      <button
                        type="button"
                        onClick={() => onBuyOrEquipColor(item.id)}
                        className="min-h-[40px] px-4 py-2 rounded-lg bg-[#222c60] hover:bg-[#2c3878] text-amber-50 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Equip {item.name}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!canAfford}
                        onClick={() => onBuyOrEquipColor(item.id)}
                        aria-label={`Buy ${item.name} for ${item.cost} gold lanterns`}
                        className={`min-h-[40px] px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                          canAfford
                            ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 cursor-pointer'
                            : 'bg-[#1b2142] text-amber-100/40 cursor-not-allowed'
                        }`}
                      >
                        <span>Buy</span>
                        <span className="font-mono-num">{item.cost}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            SHOP_HELPERS.map((helper) => {
              const currentLevel = progress.helpers[helper.id] ?? 0;
              const nextCost = getHelperNextCost(helper.id, currentLevel);
              const maxed = nextCost === null;
              const canAfford = nextCost !== null && progress.bank >= nextCost;

              return (
                <div
                  key={helper.id}
                  className="flex items-center justify-between gap-4 p-4 rounded-xl bg-[#121735] border border-amber-100/10"
                >
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2.5 flex-wrap">
                      <h3 className="text-base font-semibold text-amber-50">{helper.name}</h3>
                      <span className="text-xs font-mono-num text-amber-300/85">
                        Level {currentLevel}/{helper.maxLevel}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-amber-100/70 mt-1 leading-snug">
                      {helper.summary}
                    </p>
                  </div>

                  <div className="shrink-0">
                    {maxed ? (
                      <span className="inline-block px-3.5 py-2 text-xs sm:text-sm font-semibold text-emerald-300 whitespace-nowrap">
                        Maxed
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={!canAfford}
                        onClick={() => onBuyHelper(helper.id)}
                        aria-label={`Upgrade ${helper.name} for ${nextCost} gold lanterns`}
                        className={`min-h-[40px] px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                          canAfford
                            ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 cursor-pointer'
                            : 'bg-[#1b2142] text-amber-100/40 cursor-not-allowed'
                        }`}
                      >
                        <span>Upgrade</span>
                        <span className="font-mono-num">{nextCost}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
