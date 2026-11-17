// Night Mail's world: the whole simulation — the paper plane's flight, the scrolling city,
// delivery targets, combos, wind gusts, weather fronts, special deliveries, the moon clock,
// collisions and particles — flown as a campaign: twelve routes from campaign.js in order,
// an upgrade draft between routes, a medal scored on every route, and a win when the Storm
// Warden's quota lands before his sunrise timer. The Warden is the boss the campaign ends
// on: his delivery window glides up and down its tower, and every letter delivered makes
// his gusts come faster and harder. Winning unlocks the Night Owl, the same districts
// cycled endlessly. It knows nothing about drawing or sound; each step returns
// event flags so the shell can react.

import {
  BASE_SPEED, COMBO_MAX, COMBO_WINDOW, DELIVERY_BASE, DELIVERY_REACH, DIVE, GRAVITY,
  GUST_EVERY_MAX, GUST_EVERY_MIN, GUST_SECONDS, LIFT, MAX_FALL, MAX_RISE, NEAR_MISS_POINTS,
  NIGHT_BONUS, PLANE_RADIUS, PLANE_X, VIEW,
} from './config.js';
import { FINAL_ROUTE, NIGHT_OWL, ROUTES, UPGRADES, routeWeatherNote } from './campaign.js';
import { createCity } from './city.js';
import { createWeather } from './weather.js';
import { EXPRESS_SECONDS, assignSpecial, specialFactor } from './deliveries.js';
import { medalForRoute } from './medals.js';

/** Collisions use a slightly smaller circle than the drawing: skimming a roof should feel fair. */
const HIT_RADIUS = 11;

/**
 * The Storm Warden's escalation, per letter delivered on his route: his window swings
 * wider and faster, his gusts arrive sooner and shove harder, and each delivery wakes
 * a squall on the spot. The caps keep the last letter hard, not impossible.
 */
const BOSS_AMP_BASE = 40;
const BOSS_AMP_PER_LETTER = 5;
const BOSS_AMP_MAX = 70;
const BOSS_SWING_BASE = 1.35;
const BOSS_SWING_PER_LETTER = 0.09;
const BOSS_SWING_MAX = 2.05;
const BOSS_GUST_RATE_PER_LETTER = 0.1;
const BOSS_GUST_PUSH_PER_LETTER = 0.06;

/** The doves of the Rooftop Gardens: how close a bird must come to scatter the plane. */
const DOVE_HIT = 17;

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
export const EV_LATE = 256;
export const EV_FRAGILE = 512;
export const EV_DOVE = 1024;

export function createWorld(rng) {
  const city = createCity(rng);
  const weather = createWeather(rng);

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
    mode: 'campaign', // 'campaign' | 'owl' — the Owl cycles the routes without end
    owlLoop: 0, // completed Owl loops: each one raises the quota and the pace a step
    routeScore: 0, // points earned on the current route alone: the medal is scored on it
    routeResults: [], // campaign only: { route, score, medal } per finished route
    special: null, // the current target's special delivery (deliveries.js), or null
    pendingSpecial: null, // a special kind forced for the next target (screenshot staging)
    doves: [], // the Rooftop Gardens' flocks: { x, y, vx, seed, birds: [{dx, dy}] }
    doveTimer: 0, // seconds until the gardens loose the next flock
    boss: null, // on the Warden's route: { baseY, t } — his window's home and swing clock
    weather, // the fronts system (weather.js), stepped and read through the state
  };

  const route = () => ROUTES[state.route];
  const has = (id) => state.upgrades.includes(id);
  const comboWindow = () => (has('longcombo') ? LONGCOMBO_WINDOW : COMBO_WINDOW);
  const deliveryReach = () => (has('widebag') ? WIDEBAG_REACH : DELIVERY_REACH);
  const routeSeconds = (index) => ROUTES[index].seconds + (has('lampoil') ? LAMPOIL_SECONDS : 0);

  /**
   * How long until the next gust, on this route, right now. Gust strength stops
   * growing at the Storm Quarter (see stepPlaying's gustPush): the late districts'
   * challenge is their own weather and hazards. On the Warden's route the interval
   * itself shrinks with every letter he has lost.
   */
  function gustInterval() {
    let interval = rng.range(GUST_EVERY_MIN, GUST_EVERY_MAX) / route().wind;
    if (route().boss) interval /= 1 + BOSS_GUST_RATE_PER_LETTER * state.nightDelivered;
    return interval;
  }

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

  /** Set the run onto route `index`: quota, moon budget, skyline density, clip, weather. */
  function startRoute(index) {
    if (state.target) {
      city.clearTarget(state.target);
      state.target = null;
    }
    state.route = index;
    state.night = index + 1;
    state.quota = route().quota + (state.mode === 'owl' ? Math.min(3, state.owlLoop * NIGHT_OWL.quotaPerLoop) : 0);
    state.nightDelivered = 0;
    state.nightDuration = routeSeconds(index);
    state.nightTime = state.nightDuration;
    state.clipReady = has('sturdy');
    state.invulnT = 0;
    state.routeScore = 0;
    state.special = null;
    state.doves = [];
    state.doveTimer = rng.range(1.2, 2.4);
    state.boss = null;
    city.setDensity(route().density);
    weather.beginRoute(route(), state.cameraX);
    state.gust.nextIn = gustInterval();
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
    state.mode = 'campaign';
    state.owlLoop = 0;
    state.routeScore = 0;
    state.routeResults = [];
    state.special = null;
    state.pendingSpecial = null;
    state.doves = [];
    state.boss = null;
    city.reset();
    startRoute(0);
  }

  /** The banner a route opens with: its name, its character, and its weather warning. */
  function routeBanner() {
    const note = routeWeatherNote(route());
    showBanner(
      `Night ${state.night} · ${route().name}`,
      `${route().blurb} — deliver ${state.quota} letters${note ? `. ${note}` : ''}`,
    );
  }

  /** Begin a run from the title or the results screen: everything back to Harbour Row. */
  function startRun() {
    reset();
    state.phase = 'playing';
    routeBanner();
  }

  /** Begin a Night Owl run: the endless night, from Harbour Row, with no dawn to beat. */
  function startOwlRun() {
    reset();
    state.mode = 'owl';
    state.phase = 'playing';
    showBanner('The Night Owl', `${NIGHT_OWL.blurb} — deliver ${state.quota} letters`);
  }

  /**
   * Begin a campaign run partway in, from the campaign map: a fresh score and an
   * empty postbag, but the first route flown is the one the player picked. The
   * routes before it are simply not this run's to medal; the ones from here to
   * the Warden are, and finishing him still wins the campaign.
   */
  function startRunAt(index) {
    reset();
    startRoute(Math.max(0, Math.min(index, FINAL_ROUTE)));
    state.phase = 'playing';
    routeBanner();
  }

  /**
   * The checkpoint a saved campaign resumes from: the route the run stands at the
   * START of, with the score, letters, upgrades and route results as they were when
   * that route began — so a visit that ends mid-route loses only that route's flying,
   * never the campaign. Read at the draft, the snapshot already names the next route
   * (the draft's pick is not yet made, and is not the checkpoint's to keep).
   */
  function snapshot() {
    if (state.mode !== 'campaign' || state.phase === 'over' || state.phase === 'title') return null;
    const atDraft = state.phase === 'draft';
    return {
      route: atDraft ? state.route + 1 : state.route,
      score: atDraft ? state.score : state.score - state.routeScore,
      letters: atDraft ? state.letters : state.letters - state.nightDelivered,
      upgrades: [...state.upgrades],
      routeResults: state.routeResults.map((r) => ({ ...r })),
    };
  }

  /** Resume a campaign from a snapshot(): the run stands again at that route's start. */
  function resumeRun(saved) {
    reset();
    state.score = saved.score;
    state.letters = saved.letters;
    state.upgrades = [...saved.upgrades];
    state.routeResults = saved.routeResults.map((r) => ({ ...r }));
    startRoute(Math.max(0, Math.min(saved.route, FINAL_ROUTE)));
    state.phase = 'playing';
    showBanner(
      `Night ${state.night} · ${route().name}`,
      `Welcome back — the campaign resumes here: deliver ${state.quota} letters`,
    );
  }

  /** Fly on to the next route: the next district, or, in the Owl, the cycle's next turn. */
  function advanceRoute() {
    const prevNight = state.night;
    let next = state.route + 1;
    if (state.mode === 'owl' && next >= ROUTES.length) {
      next = 0;
      state.owlLoop += 1;
    }
    startRoute(next);
    if (state.mode === 'owl') state.night = prevNight + 1;
    state.phase = 'playing';
    routeBanner();
  }

  /**
   * The route is flown: score its medal, then open the upgrade draft — or, on the
   * campaign's Dawn Run, win the campaign. In the Owl there is no last route: the
   * draft (or, once every upgrade is aboard, the plain advance) just flies on.
   */
  function routeCleared() {
    const bonus = NIGHT_BONUS * state.night;
    state.score += bonus;
    if (state.mode === 'campaign') {
      const medal = medalForRoute(state.routeScore, route(), state.route);
      state.routeResults.push({ route: state.route, score: state.routeScore, medal });
      if (state.route >= FINAL_ROUTE) {
        state.won = true;
        state.phase = 'over';
        state.overReason = 'win';
        burst(planeWorldX(), state.plane.y, 40, '#ffcf6b', 240, 220);
        burst(planeWorldX(), state.plane.y, 18, '#fff3cf', 150, 160);
        return EV_OVER;
      }
    }
    const unowned = UPGRADES.filter((u) => !has(u.id)).map((u) => u.id);
    if (unowned.length === 0) {
      advanceRoute();
      return 0;
    }
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
    advanceRoute();
    return true;
  }

  function deliver() {
    const target = state.target;
    const special = state.special;
    state.letters += 1;
    state.nightDelivered += 1;
    state.combo = Math.min(state.combo + 1, COMBO_MAX);
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    state.comboTimer = comboWindow();
    const points = Math.round(
      DELIVERY_BASE * Math.max(1, state.combo) * (has('goldpost') ? GOLDPOST_FACTOR : 1) * specialFactor(special),
    );
    state.score += points;
    state.routeScore += points;
    burst(target.x, target.y, 22, '#ffcf6b', 170, 190);
    burst(target.x, target.y, 8, '#fff3cf', 110, 140);
    floatText(target.x, target.y - 26, `+${points}`, '#ffe9a8', 23);
    if (special && special.kind === 'express') {
      floatText(target.x, target.y - 56, 'EXPRESS — on time!', '#ffb59d', 19);
    } else if (special && special.kind === 'fragile') {
      floatText(target.x, target.y - 56, 'Fragile — delivered whole', '#bcd2ff', 19);
    }
    if (state.combo >= 2) {
      floatText(state.cameraX + PLANE_X, state.plane.y - 44, `COMBO x${state.combo}`, '#ffcf6b', 19);
    }
    city.clearTarget(target);
    state.target = null;
    state.special = null;
    state.boss = null;
    if (state.nightDelivered >= state.quota) return routeCleared();
    if (route().boss) {
      // The Warden answers every letter with a squall: his roar blasts the plane
      // skyward off the window it just used, throwing off the next approach — and
      // a breath of grace covers the blast, so the roar disrupts but never kills
      // on the spot. (A downward squall here ended runs at the window itself:
      // the porch floor is only a wingspan below it.)
      state.gust.active = true;
      state.gust.t = 1.0;
      state.gust.dir = -1;
      state.invulnT = Math.max(state.invulnT, 0.6);
      floatText(planeWorldX(), state.plane.y - 74, 'The Warden roars — his gusts rise!', '#ffb59d', 18);
      return EV_GUST;
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

  /**
   * Reinforced Wings spends its clip: a bounce off the roof instead of the end of the
   * run. A fragile letter aboard does not survive even this forgiven knock — it is
   * voided where it breaks, and the step reports it (EV_FRAGILE) beside the clip.
   */
  function clip() {
    state.clipReady = false;
    state.invulnT = 1.6;
    state.combo = 0;
    state.comboTimer = 0;
    state.plane.vy = -235;
    state.flash = 0.55;
    burst(planeWorldX(), state.plane.y, 14, '#f5f1e6', 170, 150);
    floatText(planeWorldX(), state.plane.y - 40, 'Clipped a roof — the wings hold!', '#ffe9a8', 19);
    if (state.special && state.special.kind === 'fragile' && state.target) {
      city.clearTarget(state.target);
      state.target = null;
      state.special = null;
      floatText(planeWorldX(), state.plane.y - 72, 'The fragile letter broke!', '#bcd2ff', 19);
      return EV_FRAGILE;
    }
    return 0;
  }

  /**
   * The Rooftop Gardens' doves: a terrace ahead looses its flock, which drifts back
   * across the lane on its own heading, bobbing as one body. The birds are not a
   * wall — one touch is enough: the flock bursts, the plane is knocked upward with
   * its combo gone, and the grace that follows a rooftop clip covers the escape.
   */
  function spawnFlock() {
    let home = null;
    for (const building of city.buildings) {
      if (building.x > state.cameraX + VIEW.width * 0.85) {
        home = building;
        break;
      }
    }
    const birds = [];
    const count = rng.int(5, 7);
    for (let i = 0; i < count; i += 1) {
      birds.push({ dx: rng.range(-48, 48), dy: rng.range(-22, 22) });
    }
    state.doves.push({
      x: home ? home.x + home.w / 2 : state.cameraX + VIEW.width + 220,
      y: home ? home.topY - rng.range(46, 110) : rng.range(190, 330),
      vx: -rng.range(36, 64),
      seed: rng.range(0, Math.PI * 2),
      birds,
    });
  }

  /** One bird's live position: the flock's drift plus its own flap-bob. */
  function birdPos(flock, bird) {
    return {
      x: flock.x + bird.dx,
      y: flock.y + bird.dy + Math.sin(state.time * 9 + flock.seed + bird.dx) * 3,
    };
  }

  /** A touch: the flock scatters, the combo goes with it, the plane bounces clear. */
  function scatterFlock(flock) {
    state.doves = state.doves.filter((f) => f !== flock);
    state.combo = 0;
    state.comboTimer = 0;
    state.plane.vy = -215;
    state.invulnT = Math.max(state.invulnT, 1.1);
    for (const bird of flock.birds) {
      const pos = birdPos(flock, bird);
      burst(pos.x, pos.y, 2, '#e8ecf7', 130, 120);
    }
    floatText(planeWorldX(), state.plane.y - 44, 'Doves! The flock scatters the plane', '#dfe6ff', 18);
    return EV_DOVE;
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
    state.speed = BASE_SPEED + route().speed + (state.mode === 'owl' ? state.owlLoop * NIGHT_OWL.speedPerLoop : 0);
    state.cameraX += state.speed * dt;
    weather.update(dt, state.cameraX);
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
        gust.nextIn = gustInterval();
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
    // Gust strength grows down the campaign only as far as the Storm Quarter; past
    // it the districts challenge with their own weather instead. The Warden alone
    // keeps escalating — his push grows with every letter delivered to his window.
    let gustPush = (240 + 60 * Math.min(state.route, 6)) * route().wind * (has('tailwind') ? TAILWIND_GUST_KEEP : 1);
    if (route().boss) gustPush *= 1 + BOSS_GUST_PUSH_PER_LETTER * state.nightDelivered;

    // Flight: gravity always pulls, holding climb fights it, dive adds to it, gusts
    // shove — and the weather shoves for exactly as long as the plane is inside it:
    // a rain band's push, a thermal's lift, the beam's press on a caught plane.
    plane.vy += GRAVITY * dt;
    if (control.climb) plane.vy -= LIFT * (has('tailwind') ? TAILWIND_LIFT : 1) * dt;
    if (control.dive) plane.vy += DIVE * dt;
    if (gust.active) plane.vy += gust.dir * gustPush * dt;
    plane.vy += weather.pushAt(planeWorldX(), plane.y, state.time) * dt;
    plane.vy = Math.max(MAX_RISE, Math.min(MAX_FALL, plane.vy));
    plane.y += plane.vy * dt;
    if (plane.y < 30) {
      plane.y = 30;
      plane.vy = Math.max(plane.vy, 0);
    }
    // The Narrows' cloud deck: there is no climbing out of the street. The plane
    // rides the deck's underside until the street lets it down again.
    if (route().ceiling && plane.y < route().ceiling) {
      plane.y = route().ceiling;
      plane.vy = Math.max(plane.vy, 0);
    }
    plane.angle = (plane.vy / MAX_FALL) * 0.55;
    plane.trail.push({ x: planeWorldX(), y: plane.y, life: 0.85 });
    if (plane.trail.length > 26) plane.trail.shift();

    city.ensure(state.cameraX);

    // The delivery target: keep one in play ahead of the plane. A fresh target may be
    // a special delivery (deliveries.js decides); an express one's clock runs from
    // the moment its window is chosen, and a dead clock withdraws the letter.
    if (!state.target) {
      state.target = city.chooseTarget(planeWorldX() + 430);
      if (state.target) {
        state.special = state.pendingSpecial
          ? { kind: state.pendingSpecial, t: EXPRESS_SECONDS }
          : assignSpecial(rng, state.route, state.letters);
        state.pendingSpecial = null;
        // The Warden's window is not a window: it hangs in his tower's lantern and
        // swings from the moment it is chosen. Its home is remembered here; the
        // swing itself is applied below, before the delivery check reads it.
        if (route().boss) state.boss = { baseY: state.target.y, t: 0 };
      }
    }
    if (state.target && state.special && state.special.kind === 'express') {
      state.special.t -= dt;
      if (state.special.t <= 0) {
        city.clearTarget(state.target);
        state.target = null;
        state.special = null;
        state.boss = null;
        state.combo = 0;
        state.comboTimer = 0;
        floatText(planeWorldX(), plane.y - 40, 'Too late — the express letter is withdrawn', '#ffb59d', 17);
        events |= EV_LATE;
      }
    }
    if (state.target && state.boss) {
      // The swing widens and quickens with every letter the Warden has lost: the
      // last window of the campaign will not sit still to be delivered to.
      state.boss.t += dt;
      const amp = Math.min(BOSS_AMP_MAX, BOSS_AMP_BASE + BOSS_AMP_PER_LETTER * state.nightDelivered);
      const swing = Math.min(BOSS_SWING_MAX, BOSS_SWING_BASE + BOSS_SWING_PER_LETTER * state.nightDelivered);
      state.target.y = state.boss.baseY + Math.sin(state.boss.t * swing) * amp;
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
        state.special = null;
        state.boss = null;
        if (state.combo > 0) {
          state.combo = 0;
          state.comboTimer = 0;
          floatText(planeWorldX(), plane.y - 40, 'missed — combo lost', '#9aa3d6', 17);
        }
      }
    }

    // The gardens' doves: flocks rise on their own schedule and drift across the
    // lane. They are stepped here, after the flight, so a scatter's bounce lands
    // before the rooftops are asked about — and the grace it grants covers them.
    if (route().mechanic === 'doves') {
      state.doveTimer -= dt;
      if (state.doveTimer <= 0) {
        spawnFlock();
        state.doveTimer = rng.range(2.6, 4.4);
      }
    }
    for (const flock of state.doves) {
      flock.x += flock.vx * dt;
      flock.y += Math.sin(state.time * 1.7 + flock.seed) * 11 * dt;
    }
    state.doves = state.doves.filter((flock) => flock.x > state.cameraX - 220);
    if (state.invulnT <= 0) {
      let scattered = false;
      for (const flock of state.doves) {
        if (scattered) break;
        for (const bird of flock.birds) {
          const pos = birdPos(flock, bird);
          const dx = pos.x - planeWorldX();
          const dy = pos.y - plane.y;
          if (dx * dx + dy * dy < DOVE_HIT * DOVE_HIT) {
            events |= scatterFlock(flock);
            scattered = true;
            break;
          }
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
            events |= EV_CLIP | clip();
          } else {
            crash();
            return events | EV_CRASH | EV_OVER;
          }
        }
      }
      if (!building.nearMissed && plane.y + PLANE_RADIUS > building.topY - 30 && plane.y < building.topY - 2) {
        building.nearMissed = true;
        state.score += NEAR_MISS_POINTS;
        state.routeScore += NEAR_MISS_POINTS;
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
      state.plane.trail.push({ x: planeWorldX(), y: state.plane.y, life: 0.85 });
      if (state.plane.trail.length > 26) state.plane.trail.shift();
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

  /** Force the next target chosen to be a special delivery of the given kind. */
  function forceNextSpecial(kind) {
    state.pendingSpecial = kind;
  }

  reset();

  return {
    state, city, weather, reset, startRun, startOwlRun, startRunAt, resumeRun, snapshot,
    step, pickUpgrade, jumpToRoute, forceNextSpecial,
  };
}
