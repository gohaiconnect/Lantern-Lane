import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ABSOLUTE_MAX_HEARTS,
  TIME_SLOW_FACTOR,
  activatePowerTimer,
  applyLevelClearHeartReward,
  buyHelperUpgrade,
  buyLanternColor,
  circlesOverlap,
  clampPlayerPosition,
  computeMagnetPull,
  createDefaultProgress,
  createInitialPowerTimer,
  equipLanternColor,
  getEffectiveFallSpeedMultiplier,
  getGoldValueForCatch,
  getHelperNextCost,
  getLevelClearBonusGold,
  getLevelSpeedMultiplier,
  getNebulaIntensityForSpeed,
  getNebulaLayerWeights,
  getPaceZone,
  getPlayerVerticalBounds,
  getStartingHearts,
  normalizeMoveVector,
  resolveProjectileHit,
  resolvePurpleHit,
  stepNebulaIntensity,
  tickPowerTimer,
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

  const level3Mid = getLevelSpeedMultiplier(3, 0.5);
  assert.ok(level3Mid > mid);

  const dampedMid = getLevelSpeedMultiplier(1, 0.5, 2);
  assert.ok(dampedMid < mid);
});

test('player vertical movement stays strictly inside the lower half of the screen', () => {
  const { minY, maxY } = getPlayerVerticalBounds(900, 24);
  assert.ok(minY >= 450, `Expected minY (${minY}) >= halfway (450)`);
  assert.ok(maxY < 900 && maxY > minY);

  const clampedTop = clampPlayerPosition(500, 120, 100, 900, 900, 24);
  assert.equal(clampedTop.y, minY);

  const clampedBottom = clampPlayerPosition(500, 950, 100, 900, 900, 24);
  assert.equal(clampedBottom.y, maxY);

  const diag = normalizeMoveVector(1, -1);
  assert.ok(Math.abs(Math.hypot(diag.x, diag.y) - 1) < 0.0001);
});

test('earned powers are only active for their configured duration and recharge on cooldown', () => {
  const starter = createInitialPowerTimer('solar');
  assert.equal(starter.state, 'none');
  assert.equal(activatePowerTimer(starter, 'solar').activated, false);

  let timer = createInitialPowerTimer('candle');
  assert.equal(timer.state, 'ready');

  const act = activatePowerTimer(timer, 'candle');
  assert.equal(act.activated, true);
  timer = act.next;
  assert.equal(timer.state, 'active');
  assert.equal(timer.activeRemaining, 6.0);

  // Cannot re-trigger while active
  assert.equal(activatePowerTimer(timer, 'candle').activated, false);

  // Halfway through duration
  timer = tickPowerTimer(timer, 'candle', 3.0);
  assert.equal(timer.state, 'active');
  assert.equal(timer.activeRemaining, 3.0);
  assert.ok(Math.abs(timer.charge01 - 0.5) < 0.001);

  // Duration expires -> transitions to cooldown
  timer = tickPowerTimer(timer, 'candle', 3.5);
  assert.equal(timer.state, 'cooldown');
  assert.equal(activatePowerTimer(timer, 'candle').activated, false);

  // Full cooldown finishes -> returns to ready
  timer = tickPowerTimer(timer, 'candle', 9.0);
  assert.equal(timer.state, 'ready');
  assert.equal(timer.charge01, 1);
});

test('candle shots eliminate purple obstacles and catch falling gold lanterns', () => {
  assert.equal(resolveProjectileHit('candle', 'purple_drop'), 'eliminate_purple');
  assert.equal(resolveProjectileHit('candle', 'purple_seeker'), 'eliminate_purple');
  assert.equal(resolveProjectileHit('candle', 'gold'), 'catch_gold');
  assert.equal(resolveProjectileHit('candle', 'radiant'), 'catch_gold');

  // Starlight Net catches gold lanterns and ignores purple obstacles
  assert.equal(resolveProjectileHit('starlight', 'gold'), 'catch_gold');
  assert.equal(resolveProjectileHit('starlight', 'purple_sway'), 'ignore');
});

test('chrono frost time slow reduces effective fall speed while active', () => {
  const normal = getEffectiveFallSpeedMultiplier(1.5, false);
  const slowed = getEffectiveFallSpeedMultiplier(1.5, true);
  assert.equal(normal, 1.5);
  assert.equal(slowed, Number((1.5 * TIME_SLOW_FACTOR).toFixed(4)));
});

test('pace zones divide level progress cleanly', () => {
  assert.equal(getPaceZone(0.1), 'rising');
  assert.equal(getPaceZone(0.5), 'peak');
  assert.equal(getPaceZone(0.9), 'easing');
});

test('purple lantern damage respects ghost, active shield, invulnerability, and reaches gameover at 0 hearts', () => {
  const ghost = resolvePurpleHit({
    hearts: 2,
    invulnerable: false,
    ghostActive: true,
    shieldActive: false,
  });
  assert.equal(ghost.outcome, 'ghost_phase');
  assert.equal(ghost.heartsAfter, 2);

  const shielded = resolvePurpleHit({
    hearts: 2,
    invulnerable: false,
    ghostActive: false,
    shieldActive: true,
  });
  assert.equal(shielded.outcome, 'shield_block');
  assert.equal(shielded.heartsAfter, 2);

  const hurt = resolvePurpleHit({
    hearts: 2,
    invulnerable: false,
    ghostActive: false,
    shieldActive: false,
  });
  assert.equal(hurt.outcome, 'damaged');
  assert.equal(hurt.heartsAfter, 1);

  const defeated = resolvePurpleHit({
    hearts: 1,
    invulnerable: false,
    ghostActive: false,
    shieldActive: false,
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

test('shop purchases deduct bank, unlock colors including candle, equip, and upgrade helpers safely', () => {
  let progress = createDefaultProgress();
  progress.bank = 10;

  const failColor = buyLanternColor(progress, 'cobalt');
  assert.equal(failColor.ok, false);
  assert.equal(failColor.progress.bank, 10);

  progress.bank = 60;
  const boughtCandle = buyLanternColor(progress, 'candle');
  assert.equal(boughtCandle.ok, true);
  assert.equal(boughtCandle.progress.bank, 22);
  assert.equal(boughtCandle.progress.equippedColor, 'candle');
  assert.ok(boughtCandle.progress.unlockedColors.includes('candle'));

  const equippedSolar = equipLanternColor(boughtCandle.progress, 'solar');
  assert.equal(equippedSolar.ok, true);
  assert.equal(equippedSolar.progress.equippedColor, 'solar');
  assert.equal(equippedSolar.progress.bank, 22);

  const heartCost = getHelperNextCost('extra_heart', 0)!;
  const boughtHeart = buyHelperUpgrade(equippedSolar.progress, 'extra_heart');
  assert.equal(boughtHeart.ok, true);
  assert.equal(boughtHeart.progress.bank, 22 - heartCost);
  assert.equal(getStartingHearts(boughtHeart.progress), 4);
});

test('bonus rewards and active crimson surge boost gold lantern earnings', () => {
  assert.equal(getGoldValueForCatch(false, 1, 0, 'solar', false), 1);
  assert.equal(getGoldValueForCatch(true, 1, 0, 'solar', false), 3);
  assert.equal(getGoldValueForCatch(false, 3, 1, 'solar', false), 2);
  assert.equal(getGoldValueForCatch(false, 1, 3, 'solar', false), 2);
  // Crimson surge doubles gold only while active
  assert.equal(getGoldValueForCatch(false, 1, 0, 'crimson', false), 1);
  assert.equal(getGoldValueForCatch(false, 1, 0, 'crimson', true), 2);
  assert.equal(getGoldValueForCatch(true, 1, 0, 'crimson', true), 6);
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

test('space nebula intensity shifts smoothly with speed multiplier and level progression', () => {
  const calm = getNebulaIntensityForSpeed(0.86);
  const start = getNebulaIntensityForSpeed(getLevelSpeedMultiplier(1, 0.02));
  const midLv1 = getNebulaIntensityForSpeed(getLevelSpeedMultiplier(1, 0.5));
  const midLv4 = getNebulaIntensityForSpeed(getLevelSpeedMultiplier(4, 0.5));

  assert.equal(calm, 0);
  assert.ok(start > calm, `Expected start (${start}) > calm (${calm})`);
  assert.ok(midLv1 > start, `Expected Lv1 peak (${midLv1}) > start (${start})`);
  assert.ok(midLv4 >= midLv1 && midLv4 <= 1, `Expected Lv4 peak (${midLv4}) >= Lv1 peak (${midLv1})`);

  // Layer cross-fade weights sum cleanly to 1 at all points
  assert.deepEqual(getNebulaLayerWeights(0), { calm: 1, mid: 0, peak: 0 });
  assert.deepEqual(getNebulaLayerWeights(0.5), { calm: 0, mid: 1, peak: 0 });
  assert.deepEqual(getNebulaLayerWeights(1), { calm: 0, mid: 0, peak: 1 });

  const quarter = getNebulaLayerWeights(0.25);
  assert.equal(quarter.calm, 0.5);
  assert.equal(quarter.mid, 0.5);
  assert.equal(quarter.peak, 0);

  const threeQuarter = getNebulaLayerWeights(0.75);
  assert.equal(threeQuarter.calm, 0);
  assert.equal(threeQuarter.mid, 0.5);
  assert.equal(threeQuarter.peak, 0.5);

  // Smooth step advances monotonically toward target
  const stepped = stepNebulaIntensity(0.1, 0.9, 0.05);
  assert.ok(stepped > 0.1 && stepped < 0.9);
});
