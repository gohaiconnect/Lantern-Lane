import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ABSOLUTE_MAX_HEARTS,
  applyLevelClearHeartReward,
  buyHelperUpgrade,
  buyLanternColor,
  circlesOverlap,
  computeMagnetPull,
  createDefaultProgress,
  equipLanternColor,
  getGoldValueForCatch,
  getHelperNextCost,
  getLevelClearBonusGold,
  getLevelSpeedMultiplier,
  getPaceZone,
  getStartingHearts,
  resolvePurpleHit,
} from './rules';

test('level speed curve starts brisk, peaks fastest in the middle, and slows down near the end', () => {
  const start = getLevelSpeedMultiplier(1, 0.02);
  const early = getLevelSpeedMultiplier(1, 0.15);
  const mid = getLevelSpeedMultiplier(1, 0.5);
  const late = getLevelSpeedMultiplier(1, 0.85);
  const end = getLevelSpeedMultiplier(1, 0.98);

  assert.ok(mid > start, `Expected middle (${mid}) > start (${start})`);
  assert.ok(mid > early, `Expected middle (${mid}) > early (${early})`);
  assert.ok(mid > late, `Expected middle (${mid}) > late (${late})`);
  assert.ok(mid > end, `Expected middle (${mid}) > end (${end})`);
  assert.ok(start > end, `Expected start (${start}) to be faster than end (${end})`);

  // Higher level scales faster
  const level3Mid = getLevelSpeedMultiplier(3, 0.5);
  assert.ok(level3Mid > mid);

  // Starlight compass dampens peak speed
  const dampedMid = getLevelSpeedMultiplier(1, 0.5, 2);
  assert.ok(dampedMid < mid);
});

test('pace zones divide level progress cleanly', () => {
  assert.equal(getPaceZone(0.1), 'rising');
  assert.equal(getPaceZone(0.5), 'peak');
  assert.equal(getPaceZone(0.9), 'easing');
});

test('purple lantern damage respects ghost, shield, invulnerability, and reaches gameover at 0 hearts', () => {
  const ghost = resolvePurpleHit({
    hearts: 2,
    invulnerable: false,
    ghostActive: true,
    shieldReady: false,
  });
  assert.equal(ghost.outcome, 'ghost_phase');
  assert.equal(ghost.heartsAfter, 2);

  const shielded = resolvePurpleHit({
    hearts: 2,
    invulnerable: false,
    ghostActive: false,
    shieldReady: true,
  });
  assert.equal(shielded.outcome, 'shield_block');
  assert.equal(shielded.heartsAfter, 2);
  assert.equal(shielded.consumedShield, true);

  const hurt = resolvePurpleHit({
    hearts: 2,
    invulnerable: false,
    ghostActive: false,
    shieldReady: false,
  });
  assert.equal(hurt.outcome, 'damaged');
  assert.equal(hurt.heartsAfter, 1);

  const defeated = resolvePurpleHit({
    hearts: 1,
    invulnerable: false,
    ghostActive: false,
    shieldReady: false,
  });
  assert.equal(defeated.outcome, 'defeated');
  assert.equal(defeated.heartsAfter, 0);
});

test('clearing a level awards an extra heart up to the cap', () => {
  const healed = applyLevelClearHeartReward(2, 3);
  assert.deepEqual(healed, { hearts: 3, maxHearts: 3, heartEarned: true });

  const expanded = applyLevelClearHeartReward(3, 3);
  assert.deepEqual(expanded, { hearts: 4, maxHearts: 4, heartEarned: true });

  const capped = applyLevelClearHeartReward(ABSOLUTE_MAX_HEARTS, ABSOLUTE_MAX_HEARTS);
  assert.deepEqual(capped, {
    hearts: ABSOLUTE_MAX_HEARTS,
    maxHearts: ABSOLUTE_MAX_HEARTS,
    heartEarned: false,
  });
});

test('shop purchases deduct bank, unlock colors, equip, and upgrade helpers safely', () => {
  let progress = createDefaultProgress();
  progress.bank = 10;

  // Cannot afford cobalt (15)
  const failColor = buyLanternColor(progress, 'cobalt');
  assert.equal(failColor.ok, false);
  assert.equal(failColor.progress.bank, 10);

  // Give enough bank and buy cobalt
  progress.bank = 50;
  const boughtCobalt = buyLanternColor(progress, 'cobalt');
  assert.equal(boughtCobalt.ok, true);
  assert.equal(boughtCobalt.progress.bank, 35);
  assert.equal(boughtCobalt.progress.equippedColor, 'cobalt');
  assert.ok(boughtCobalt.progress.unlockedColors.includes('cobalt'));

  // Equip solar back without spending gold
  const equippedSolar = equipLanternColor(boughtCobalt.progress, 'solar');
  assert.equal(equippedSolar.ok, true);
  assert.equal(equippedSolar.progress.equippedColor, 'solar');
  assert.equal(equippedSolar.progress.bank, 35);

  // Buy Extra Heart helper
  const heartCost = getHelperNextCost('extra_heart', 0)!;
  const boughtHeart = buyHelperUpgrade(equippedSolar.progress, 'extra_heart');
  assert.equal(boughtHeart.ok, true);
  assert.equal(boughtHeart.progress.bank, 35 - heartCost);
  assert.equal(getStartingHearts(boughtHeart.progress), 4);
});

test('bonus rewards and crimson streak boost gold lantern earnings', () => {
  assert.equal(getGoldValueForCatch(false, 1, 0, 'solar'), 1);
  assert.equal(getGoldValueForCatch(true, 1, 0, 'solar'), 3);
  assert.equal(getGoldValueForCatch(false, 3, 1, 'solar'), 2);
  assert.equal(getGoldValueForCatch(false, 1, 3, 'solar'), 2);
  assert.equal(getGoldValueForCatch(false, 5, 0, 'crimson'), 3);
  assert.ok(getLevelClearBonusGold(2, 2) > getLevelClearBonusGold(2, 0));
});

test('magnet pull pulls gold lanterns toward player inside radius only', () => {
  const inside = computeMagnetPull(200, 500, 140, 460, 180, 500);
  assert.equal(inside.active, true);
  assert.ok(inside.ax > 0);
  assert.ok(inside.ay > 0);

  const outside = computeMagnetPull(200, 500, 500, 100, 180, 500);
  assert.equal(outside.active, false);
  assert.equal(outside.ax, 0);

  assert.equal(circlesOverlap(0, 0, 20, 30, 0, 15), true);
  assert.equal(circlesOverlap(0, 0, 20, 50, 0, 15), false);
});
