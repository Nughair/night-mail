// Night Mail's world: the whole simulation — the paper plane's flight, the scrolling city,
// delivery targets, combos, wind gusts, the moon clock, collisions and particles — now flown
// as a campaign: six routes from campaign.js in order, an upgrade draft between routes, and
// a win when the Dawn Run's quota lands before its sunrise timer. It knows nothing about
// drawing or sound; each step returns event flags so the shell can react.

import {
  BASE_SPEED, COMBO_MAX, COMBO_WINDOW, DELIVERY_BASE, DELIVERY_REACH, DIVE, GRAVITY,
  GUST_EVERY_MAX, GUST_EVERY_MIN, GUST_SECONDS, LIFT, MAX_FALL, MAX_RISE, NEAR_MISS_POINTS,
  NIGHT_BONUS, PLANE_RADIUS, PLANE_X, VIEW,
} from './config.js';
import { FINAL_ROUTE, ROUTES, UPGRADES } from './campaign.js';
import { createCity } from './city.js';

/** Collisions use a slightly smaller circle than the drawing: skimming a roof should feel fair. */
const HIT_RADIUS = 11;

/** What the upgrades change, in one place: the numbers the flight below is computed from. */
const TAILWIND_LIFT = 1.2;
const TAILWIND_GUST_KEEP = 2 / 3;
const WIDEBAG_REACH = 64;
const LONGCOMBO_WINDOW = 10;
const LAMPOIL_SECONDS = 10;
const GOLDPOST_FACTOR = 1.5;

export const EV_DELIVER = 1;
export const EV_CRASH = 2;
export const EV_NEAR_MISS = 4;
export const EV_OVER = 16;
export const EV_GUST = 32;
export const EV_DRAFT = 64;
export const EV_CLIP = 128;

export function createWorld(rng) {
  const city = createCity(rng);

  const state = {
    phase: 'title', // 'title' | 'playing' | 'draft' | 'over'
    time: 0,
    cameraX: 0,
    speed: BASE_SPEED,
    route: 0,
    night: 1,
    nightTime: ROUTES[0].seconds,
    nightDuration: ROUTES[0].seconds,
    nightDelivered: 0,
    quota: ROUTES[0].quota,
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
    overReason: null, // 'crash' | 'dawn' | 'win'
    upgrades: [], // ids from campaign.js UPGRADES, in the order they were drafted
    draft: null, // while phase is 'draft': { choices: [upgrade ids on offer] }
    won: false,
    clipReady: false, // Reinforced Wings: this route's one survivable clip is still unused
    invulnT: 0, // seconds of post-clip grace left, during which rooftops cannot hurt
  };

  const route = () => ROUTES[state.route];
  const has = (id) => state.upgrades.includes(id);
  const comboWindow = () => (has('longcombo') ? LONGCOMBO_WINDOW : COMBO_WINDOW);
  const deliveryReach = () => (has('widebag') ? WIDEBAG_REACH : DELIVERY_REACH);
  const routeSeconds = (index) => ROUTES[index].seconds + (has('lampoil') ? LAMPOIL_SECONDS : 0);

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

  /** Set the run onto route `index`: its quota, moon budget, skyline density and clip. */
  function startRoute(index) {
    if (state.target) {
      city.clearTarget(state.target);
      state.target = null;
    }
    state.route = index;
    state.night = index + 1;
    state.quota = route().quota;
    state.nightDelivered = 0;
    state.nightDuration = routeSeconds(index);
    state.nightTime = state.nightDuration;
    state.clipReady = has('sturdy');
    state.invulnT = 0;
    city.setDensity(route().density);
    state.gust.nextIn = rng.range(GUST_EVERY_MIN, GUST_EVERY_MAX) / route().wind;
  }

  function reset() {
    state.phase = 'title';
    state.time = 0;
    state.cameraX = 0;
    state.speed = BASE_SPEED;
    state.score = 0;
    state.letters = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.bestCombo = 0;
    state.plane = { y: 300, vy: 0, angle: 0, dead: false, trail: [] };
    state.gust = { active: false, t: 0, dir: 1, nextIn: rng.range(GUST_EVERY_MIN, GUST_EVERY_MAX) };
    state.particles = [];
    state.texts = [];
    state.banner = null;
    state.flash = 0;
    state.overReason = null;
    state.upgrades = [];
    state.draft = null;
    state.won = false;
    city.reset();
    startRoute(0);
  }

  /** Begin a run from the title or the results screen: everything back to Harbour Row. */
  function startRun() {
    reset();
    state.phase = 'playing';
    showBanner(`Night 1 · ${route().name}`, `${route().blurb} — deliver ${state.quota} letters`);
  }

  /** The route is flown: open the upgrade draft, or, on the Dawn Run, win the campaign. */
  function routeCleared() {
    const bonus = NIGHT_BONUS * state.night;
    state.score += bonus;
    if (state.route >= FINAL_ROUTE) {
      state.won = true;
      state.phase = 'over';
      state.overReason = 'win';
      burst(planeWorldX(), state.plane.y, 40, '#ffcf6b', 240, 220);
      burst(planeWorldX(), state.plane.y, 18, '#fff3cf', 150, 160);
      return EV_OVER;
    }
    const unowned = UPGRADES.filter((u) => !has(u.id)).map((u) => u.id);
    // Offer three of the upgrades not yet owned (fewer only when the pool runs dry).
    for (let i = unowned.length - 1; i > 0; i -= 1) {
      const j = rng.int(0, i);
      [unowned[i], unowned[j]] = [unowned[j], unowned[i]];
    }
    state.draft = { choices: unowned.slice(0, 3), bonus };
    state.phase = 'draft';
    return EV_DRAFT;
  }

  /** Take one of the draft's offered upgrades and fly on to the next route. */
  function pickUpgrade(id) {
    if (state.phase !== 'draft' || !state.draft || !state.draft.choices.includes(id)) return false;
    state.upgrades.push(id);
    state.draft = null;
    startRoute(state.route + 1);
    state.phase = 'playing';
    showBanner(`Night ${state.night} · ${route().name}`, `${route().blurb} — deliver ${state.quota} letters`);
    return true;
  }

  function deliver() {
    const target = state.target;
    state.letters += 1;
    state.nightDelivered += 1;
    state.combo = Math.min(state.combo + 1, COMBO_MAX);
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    state.comboTimer = comboWindow();
    const points = Math.round(DELIVERY_BASE * Math.max(1, state.combo) * (has('goldpost') ? GOLDPOST_FACTOR : 1));
    state.score += points;
    burst(target.x, target.y, 22, '#ffcf6b', 170, 190);
    burst(target.x, target.y, 8, '#fff3cf', 110, 140);
    floatText(target.x, target.y - 26, `+${points}`, '#ffe9a8', 23);
    if (state.combo >= 2) {
      floatText(state.cameraX + PLANE_X, state.plane.y - 44, `COMBO x${state.combo}`, '#ffcf6b', 19);
    }
    city.clearTarget(target);
    state.target = null;
    if (state.nightDelivered >= state.quota) return routeCleared();
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

  /** Reinforced Wings spends its clip: a bounce off the roof instead of the end of the run. */
  function clip() {
    state.clipReady = false;
    state.invulnT = 1.6;
    state.combo = 0;
    state.comboTimer = 0;
    state.plane.vy = -235;
    state.flash = 0.55;
    burst(planeWorldX(), state.plane.y, 14, '#f5f1e6', 170, 150);
    floatText(planeWorldX(), state.plane.y - 40, 'Clipped a roof — the wings hold!', '#ffe9a8', 19);
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
    state.speed = BASE_SPEED + route().speed;
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
    if (state.invulnT > 0) state.invulnT -= dt;

    // Wind gusts arrive on their own schedule and shove the plane up or down; a stronger
    // route blows harder and, past the calm districts, more often.
    const gust = state.gust;
    if (gust.active) {
      gust.t -= dt;
      if (gust.t <= 0) {
        gust.active = false;
        gust.nextIn = rng.range(GUST_EVERY_MIN, GUST_EVERY_MAX) / route().wind;
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
    const gustPush = (240 + 60 * state.route) * route().wind * (has('tailwind') ? TAILWIND_GUST_KEEP : 1);

    // Flight: gravity always pulls, holding climb fights it, dive adds to it, gusts shove.
    plane.vy += GRAVITY * dt;
    if (control.climb) plane.vy -= LIFT * (has('tailwind') ? TAILWIND_LIFT : 1) * dt;
    if (control.dive) plane.vy += DIVE * dt;
    if (gust.active) plane.vy += gust.dir * gustPush * dt;
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
      const reach = deliveryReach();
      if (dx * dx + dy * dy <= reach * reach) {
        events |= EV_DELIVER | deliver();
        if (state.phase !== 'playing') return events;
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

    // Rooftops: solid, unless the wings' one clip or its grace says otherwise. Skimming
    // one without touching is worth a little courage bonus.
    for (const building of city.buildings) {
      if (building.x + building.w < planeWorldX() - 40 || building.x > planeWorldX() + 40) continue;
      if (state.invulnT <= 0) {
        let hit = false;
        for (const rect of city.solidRects(building)) {
          if (circleHitsRect(planeWorldX(), plane.y, HIT_RADIUS, rect)) {
            hit = true;
            break;
          }
        }
        if (hit) {
          if (state.clipReady) {
            clip();
            events |= EV_CLIP;
          } else {
            crash();
            return events | EV_CRASH | EV_OVER;
          }
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
    // Title, draft and results screens: the city drifts by slowly and the plane bobs.
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

  /**
   * Put the run directly onto a route, keeping score and upgrades: the screenshot scenes
   * stage a campaign already under way, and they stage it through the same door a draft
   * pick uses, so what they show is the real state machine.
   */
  function jumpToRoute(index) {
    startRoute(index);
    state.phase = 'playing';
  }

  reset();

  return { state, city, reset, startRun, step, pickUpgrade, jumpToRoute };
}
