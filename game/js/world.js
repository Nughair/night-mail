// Night Mail's world: the whole simulation — the paper plane's flight, the scrolling city,
// delivery targets, combos, wind gusts, the night clock, collisions and particles. It knows
// nothing about drawing or sound; each step returns event flags so the shell can react.

import {
  BASE_SPEED, COMBO_MAX, COMBO_WINDOW, DELIVERY_BASE, DELIVERY_REACH, DIVE, GRAVITY,
  GUST_EVERY_MAX, GUST_EVERY_MIN, GUST_SECONDS, LIFT, MAX_FALL, MAX_RISE, NEAR_MISS_POINTS,
  NIGHT_BONUS, NIGHT_SECONDS, PLANE_RADIUS, PLANE_X, SPEED_PER_NIGHT, VIEW,
  gustStrength, nightQuota,
} from './config.js';
import { createCity } from './city.js';

/** Collisions use a slightly smaller circle than the drawing: skimming a roof should feel fair. */
const HIT_RADIUS = 11;

export const EV_DELIVER = 1;
export const EV_CRASH = 2;
export const EV_NEAR_MISS = 4;
export const EV_NIGHT = 8;
export const EV_OVER = 16;
export const EV_GUST = 32;

export function createWorld(rng) {
  const city = createCity(rng);

  const state = {
    phase: 'title', // 'title' | 'playing' | 'over'
    time: 0,
    cameraX: 0,
    speed: BASE_SPEED,
    night: 1,
    nightTime: NIGHT_SECONDS,
    nightDelivered: 0,
    quota: nightQuota(1),
    score: 0,
    letters: 0,
    combo: 0,
    comboTimer: 0,
    bestCombo: 0,
    plane: { y: 300, vy: 0, angle: 0, dead: false, trail: [] },
    target: null,
    gust: { active: false, t: 0, dir: 1, nextIn: 9 },
    particles: [],
    texts: [],
    banner: null,
    flash: 0,
    overReason: null, // 'crash' | 'dawn'
  };

  function planeWorldX() {
    return state.cameraX + PLANE_X;
  }

  function burst(x, y, count, color, spread, up) {
    for (let i = 0; i < count; i += 1) {
      state.particles.push({
        x: x + rng.range(-6, 6),
        y: y + rng.range(-6, 6),
        vx: rng.range(-spread, spread),
        vy: rng.range(-up, up * 0.4),
        life: rng.range(0.4, 0.95),
        maxLife: 0.95,
        size: rng.range(2, 4.6),
        color,
        gravity: 320,
      });
    }
  }

  function floatText(x, y, text, color, size = 21) {
    state.texts.push({ x, y, vy: -46, life: 1.15, maxLife: 1.15, text, color, size });
  }

  function showBanner(text, sub) {
    state.banner = { text, sub, t: 0, dur: 2.4 };
  }

  function reset() {
    state.phase = 'title';
    state.time = 0;
    state.cameraX = 0;
    state.speed = BASE_SPEED;
    state.night = 1;
    state.nightTime = NIGHT_SECONDS;
    state.nightDelivered = 0;
    state.quota = nightQuota(1);
    state.score = 0;
    state.letters = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.bestCombo = 0;
    state.plane = { y: 300, vy: 0, angle: 0, dead: false, trail: [] };
    state.target = null;
    state.gust = { active: false, t: 0, dir: 1, nextIn: rng.range(GUST_EVERY_MIN, GUST_EVERY_MAX) };
    state.particles = [];
    state.texts = [];
    state.banner = null;
    state.flash = 0;
    state.overReason = null;
    city.reset();
  }

  /** Begin a run from the title or the results screen: everything back to night 1. */
  function startRun() {
    reset();
    state.phase = 'playing';
    showBanner('Night 1', `Deliver ${state.quota} letters before the moon sets`);
  }

  function deliver() {
    const target = state.target;
    state.letters += 1;
    state.nightDelivered += 1;
    state.combo = Math.min(state.combo + 1, COMBO_MAX);
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    state.comboTimer = COMBO_WINDOW;
    const points = DELIVERY_BASE * Math.max(1, state.combo);
    state.score += points;
    burst(target.x, target.y, 22, '#ffcf6b', 170, 190);
    burst(target.x, target.y, 8, '#fff3cf', 110, 140);
    floatText(target.x, target.y - 26, `+${points}`, '#ffe9a8', 23);
    if (state.combo >= 2) {
      floatText(state.cameraX + PLANE_X, state.plane.y - 44, `COMBO x${state.combo}`, '#ffcf6b', 19);
    }
    city.clearTarget(target);
    state.target = null;
    if (state.nightDelivered >= state.quota) {
      const bonus = NIGHT_BONUS * state.night;
      state.score += bonus;
      state.night += 1;
      state.nightDelivered = 0;
      state.quota = nightQuota(state.night);
      state.nightTime = NIGHT_SECONDS;
      showBanner(`Night ${state.night}`, `Bonus +${bonus} — deliver ${state.quota} letters`);
      return EV_NIGHT;
    }
    return 0;
  }

  function crash() {
    state.phase = 'over';
    state.overReason = 'crash';
    state.plane.dead = true;
    state.flash = 1;
    burst(planeWorldX(), state.plane.y, 30, '#f5f1e6', 230, 200);
    burst(planeWorldX(), state.plane.y, 12, '#c9c2ae', 160, 150);
  }

  function circleHitsRect(cx, cy, r, rect) {
    const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
    const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  function stepPlaying(dt, control) {
    let events = 0;
    const plane = state.plane;
    state.speed = BASE_SPEED + SPEED_PER_NIGHT * (state.night - 1);
    state.cameraX += state.speed * dt;
    state.nightTime -= dt;
    if (state.nightTime <= 0) {
      state.nightTime = 0;
      state.phase = 'over';
      state.overReason = 'dawn';
      return EV_OVER;
    }
    if (state.combo > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }

    // Wind gusts arrive on their own schedule and shove the plane up or down.
    const gust = state.gust;
    if (gust.active) {
      gust.t -= dt;
      if (gust.t <= 0) {
        gust.active = false;
        gust.nextIn = rng.range(GUST_EVERY_MIN, GUST_EVERY_MAX);
      }
    } else {
      gust.nextIn -= dt;
      if (gust.nextIn <= 0) {
        gust.active = true;
        gust.t = GUST_SECONDS;
        gust.dir = rng.chance(0.5) ? 1 : -1;
        events |= EV_GUST;
      }
    }

    // Flight: gravity always pulls, holding climb fights it, dive adds to it, gusts shove.
    plane.vy += GRAVITY * dt;
    if (control.climb) plane.vy -= LIFT * dt;
    if (control.dive) plane.vy += DIVE * dt;
    if (gust.active) plane.vy += gust.dir * gustStrength(state.night) * dt;
    plane.vy = Math.max(MAX_RISE, Math.min(MAX_FALL, plane.vy));
    plane.y += plane.vy * dt;
    if (plane.y < 30) {
      plane.y = 30;
      plane.vy = Math.max(plane.vy, 0);
    }
    plane.angle = (plane.vy / MAX_FALL) * 0.55;
    plane.trail.push({ x: planeWorldX(), y: plane.y, life: 0.5 });
    if (plane.trail.length > 16) plane.trail.shift();

    city.ensure(state.cameraX);

    // The delivery target: keep one in play ahead of the plane.
    if (!state.target) {
      state.target = city.chooseTarget(planeWorldX() + 430);
    }
    if (state.target) {
      const dx = state.target.x - planeWorldX();
      const dy = state.target.y - plane.y;
      if (dx * dx + dy * dy <= DELIVERY_REACH * DELIVERY_REACH) {
        events |= EV_DELIVER | deliver();
      } else if (state.target.x < planeWorldX() - 80) {
        city.clearTarget(state.target);
        state.target = null;
        if (state.combo > 0) {
          state.combo = 0;
          state.comboTimer = 0;
          floatText(planeWorldX(), plane.y - 40, 'missed — combo lost', '#9aa3d6', 17);
        }
      }
    }

    // Rooftops: solid. Skimming one without touching is worth a little courage bonus.
    for (const building of city.buildings) {
      if (building.x + building.w < planeWorldX() - 40 || building.x > planeWorldX() + 40) continue;
      for (const rect of city.solidRects(building)) {
        if (circleHitsRect(planeWorldX(), plane.y, HIT_RADIUS, rect)) {
          crash();
          return events | EV_CRASH | EV_OVER;
        }
      }
      if (!building.nearMissed && plane.y + PLANE_RADIUS > building.topY - 30 && plane.y < building.topY - 2) {
        building.nearMissed = true;
        state.score += NEAR_MISS_POINTS;
        floatText(planeWorldX(), plane.y - 34, `+${NEAR_MISS_POINTS} close!`, '#e9ecff', 16);
        events |= EV_NEAR_MISS;
      }
    }
    return events;
  }

  function stepAmbient(dt) {
    // Title and results screens: the city drifts by slowly and the plane bobs on the air.
    state.cameraX += 42 * dt;
    state.plane.y = 292 + Math.sin(state.time * 1.25) * 24;
    state.plane.vy = Math.cos(state.time * 1.25) * 30;
    state.plane.angle = Math.cos(state.time * 1.25) * 0.12;
    if (!state.plane.dead) {
      state.plane.trail.push({ x: planeWorldX(), y: state.plane.y, life: 0.5 });
      if (state.plane.trail.length > 16) state.plane.trail.shift();
    }
    city.ensure(state.cameraX);
  }

  function stepFx(dt) {
    for (const p of state.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.life -= dt;
    }
    state.particles = state.particles.filter((p) => p.life > 0);
    for (const t of state.texts) {
      t.y += t.vy * dt;
      t.life -= dt;
    }
    state.texts = state.texts.filter((t) => t.life > 0);
    for (const point of state.plane.trail) point.life -= dt;
    state.plane.trail = state.plane.trail.filter((p) => p.life > 0);
    if (state.banner) {
      state.banner.t += dt;
      if (state.banner.t >= state.banner.dur) state.banner = null;
    }
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 1.6);
  }

  /** Advance the world by dt under the player's control; returns the step's event flags. */
  function step(dt, control) {
    state.time += dt;
    let events = 0;
    if (state.phase === 'playing') events = stepPlaying(dt, control);
    else stepAmbient(dt);
    stepFx(dt);
    return events;
  }

  reset();

  return { state, city, reset, startRun, step };
}
