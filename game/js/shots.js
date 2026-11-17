// The screenshot scenes behind ?shot=title|campaign|boss|over (with &seed=N; draft,
// storm and play remain as alternates). Each scene builds a real world from the seed
// and plays it forward with the autopilot below — steer at the target window, stay
// clear of the rooftops — so the frame is what an actual game looks like, and the
// same seed always produces the same frame. Nothing here draws anything itself. The
// scenes stage the campaign arc: the title of a returning pilot (a campaign in
// progress to continue, medals held, the Owl unlocked), the campaign map with the
// save drawn on it, the Storm Warden's swinging lantern mid-fight, and the results
// of a won campaign with its medal strip.

import {
  BASE_SPEED, DELIVERY_REACH, DIVE, GRAVITY, LIFT, MAX_FALL, MAX_RISE, PLANE_X, STEP,
} from './config.js';
import { ROUTES } from './campaign.js';
import { createRandom } from './random.js';
import { createWorld, EV_DELIVER, EV_OVER } from './world.js';
import { createCampaignRecord, medalForRoute, recordRouteResult } from './medals.js';

/** The flight forces of one step, mirroring world.js exactly (upgrades included), so the
 *  autopilot's replay below predicts the real flight and not last version's. */
function stepForces(state) {
  const route = ROUTES[state.route];
  const tailwind = state.upgrades.includes('tailwind');
  let gustPush = (240 + 60 * Math.min(state.route, 6)) * route.wind * (tailwind ? 2 / 3 : 1);
  if (route.boss) gustPush *= 1 + 0.06 * state.nightDelivered;
  return {
    speed: BASE_SPEED + route.speed,
    lift: LIFT * (tailwind ? 1.2 : 1),
    gustPush,
  };
}

/**
 * The altitude the pilot aims for: the target window's height, held back by the rooftops in
 * between — cross each intervening building either above its rooftop clutter (when the
 * window is high) or through its porch lane (when the window is low), and never plan to
 * sink past a porch floor.
 */
function planWant(state, city) {
  const planeX = state.cameraX + PLANE_X;
  let want = 235;
  const target = state.target;
  const buildings = city.buildings;
  if (target) {
    want = target.y;
    for (const b of buildings) {
      if (b === target.building) break;
      if (b.x + b.w <= planeX - 10) continue;
      want = Math.min(want, ceilingOver(b, planeX, target.y));
    }
  } else {
    let seen = 0;
    for (const b of buildings) {
      if (b.x + b.w <= planeX - 10) continue;
      want = Math.min(want, ceilingOver(b, planeX, null));
      seen += 1;
      if (seen >= 2) break;
    }
  }
  // The Narrows' deck: never plan a climb the cloud will not allow.
  const deck = ROUTES[state.route].ceiling;
  if (deck) want = Math.max(want, deck + 12);
  return Math.max(64, want);
}

/** The lowest y at which the pilot may cross one building, given where the window is. */
function ceilingOver(building, planeX, targetY) {
  let ceiling = building.topY + 48;
  const structure = building.chimney || building.tower;
  if (!structure) return ceiling;
  const structureRight = building.x + structure.dx + structure.w;
  if (structureRight <= planeX - 10) return ceiling; // the clutter is already behind the plane
  if (targetY !== null && targetY > building.topY + 20) return ceiling; // pass under it, in the porch lane
  return Math.min(ceiling, building.topY - structure.h - 16); // stay above it
}

/** One proportional steering decision toward the planned altitude, shifted by wantBias. */
function pdControl(state, city, wantBias) {
  const want = planWant(state, city) + wantBias;
  const y = state.plane.y;
  const vy = state.plane.vy;
  const predicted = y + vy * 0.35;
  return {
    climb: predicted > want + 2 || y > want + 8,
    dive: (predicted < want - 14 && y < want - 8) || y < want - 64,
  };
}

/**
 * Replay the pilot's own steering (with an altitude bias) over a copy of the flight;
 * returns how many steps the replay survives before a rooftop ends it (the full horizon
 * when it never does). The replay steers the same way the pilot does, against a slightly
 * fatter collision circle than the world's, so a dive the pilot would pull out of in time
 * is not vetoed — but a dive it would ride into a chimney on the way down to a porch
 * lane is, with a breath to spare.
 */
function policySurvival(world, wantBias, steps) {
  const s = world.state;
  const forces = stepForces(s);
  const sim = {
    cameraX: s.cameraX,
    route: s.route,
    upgrades: s.upgrades,
    plane: { y: s.plane.y, vy: s.plane.vy },
    gust: s.gust,
    target: s.target,
  };
  for (let i = 0; i < steps; i += 1) {
    const control = pdControl(sim, world.city, wantBias);
    sim.cameraX += forces.speed * STEP;
    sim.plane.vy += GRAVITY * STEP;
    if (control.climb) sim.plane.vy -= forces.lift * STEP;
    if (control.dive) sim.plane.vy += DIVE * STEP;
    if (sim.gust.active) sim.plane.vy += sim.gust.dir * forces.gustPush * STEP;
    // Weather pushes where it stands — rain, thermals, the beam's press; the fronts
    // barely drift over a replay's second, so the live system's answer at the
    // replayed position and moment is close enough.
    sim.plane.vy += world.weather.pushAt(sim.cameraX + PLANE_X, sim.plane.y, s.time + i * STEP) * STEP;
    sim.plane.vy = Math.max(MAX_RISE, Math.min(MAX_FALL, sim.plane.vy));
    sim.plane.y += sim.plane.vy * STEP;
    if (sim.plane.y < 30) {
      sim.plane.y = 30;
      sim.plane.vy = Math.max(sim.plane.vy, 0);
    }
    const deck = ROUTES[sim.route].ceiling;
    if (deck && sim.plane.y < deck) {
      sim.plane.y = deck;
      sim.plane.vy = Math.max(sim.plane.vy, 0);
    }
    const planeX = sim.cameraX + PLANE_X;
    // A replay that slips the letter in has done its job: the target is delivered, and
    // the rest of the replay is the climb away, not a doomed porch dive past the window.
    if (sim.target) {
      const dx = sim.target.x - planeX;
      const dy = sim.target.y - sim.plane.y;
      const reach = s.upgrades.includes('widebag') ? 64 : DELIVERY_REACH;
      if (dx * dx + dy * dy <= reach * reach) sim.target = null;
      else if (sim.target.x < planeX - 80) sim.target = null;
    }
    for (const building of world.city.buildings) {
      if (building.x + building.w < planeX - 20 || building.x > planeX + 20) continue;
      for (const rect of world.city.solidRects(building)) {
        const nx = Math.max(rect.x, Math.min(planeX, rect.x + rect.w));
        const ny = Math.max(rect.y, Math.min(sim.plane.y, rect.y + rect.h));
        if ((planeX - nx) ** 2 + (sim.plane.y - ny) ** 2 < 12 * 12) return i;
      }
    }
  }
  return steps;
}

/**
 * The autopilot: fly the plan; when the plan's own replay dies against a rooftop, fly
 * the same plan biased high (climb away) or low (duck through a porch) — whichever bias
 * the replays say lives longest, the plain plan winning ties.
 */
export function autopilotControl(world) {
  const HORIZON = 72;
  let bestBias = 0;
  let bestSurvival = policySurvival(world, 0, HORIZON);
  if (bestSurvival < HORIZON) {
    for (const bias of [-130, 130]) {
      const survival = policySurvival(world, bias, HORIZON);
      if (survival > bestSurvival) {
        bestSurvival = survival;
        bestBias = bias;
      }
    }
  }
  return pdControl(world.state, world.city, bestBias);
}

/** Step the world under a control function until stopWhen says stop or the budget runs out. */
function playForward(world, controlFor, stopWhen, maxSeconds) {
  const steps = Math.floor(maxSeconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const events = world.step(STEP, controlFor(world));
    if (stopWhen && stopWhen(world, events)) return true;
  }
  return false;
}

/**
 * A returning pilot's save, built through medals.js's own folding so every medal on
 * it is one its score truly earns: eight routes held, the frontier at the Market
 * District, three upgrades in the postbag, one campaign won, the Owl open — and a
 * campaign in progress, standing at the start of Night 9 with two upgrades aboard,
 * waiting to be continued. The map and the title both draw from this one record.
 */
function stagedRecord() {
  const record = createCampaignRecord(ROUTES.length);
  const scores = [1250, 2150, 1900, 2900, 3100, 2400, 2900, 2600];
  scores.forEach((score, i) => {
    if (score > 0) recordRouteResult(record, i, score, ROUTES[i]);
  });
  record.wins = 1;
  record.owlUnlocked = true;
  record.frontier = 8;
  record.collected = ['tailwind', 'widebag', 'sturdy'];
  record.checkpoint = {
    route: 8,
    score: 15230,
    letters: 49,
    upgrades: ['tailwind', 'sturdy'],
    routeResults: scores.map((score, i) => ({ route: i, score, medal: medalForRoute(score, ROUTES[i], i) })),
  };
  return record;
}

function stageTitle(seed) {
  const world = createWorld(createRandom(seed));
  playForward(world, () => ({ climb: false, dive: false }), null, 4.5);
  return { world, screen: 'title', best: 12480, isNewBest: false, record: stagedRecord() };
}

/**
 * The campaign map: the same returning pilot's save, drawn in full — medals across
 * the first eight routes, the frontier open at the Market District with a campaign
 * in progress standing there, the last three routes and the Warden locked behind
 * it, and the postbag with three upgrades collected. The world behind it is the
 * title's ambient drift.
 */
function stageCampaign(seed) {
  const world = createWorld(createRandom(seed));
  playForward(world, () => ({ climb: false, dive: false }), null, 3.2);
  return { world, screen: 'campaign', best: 12480, isNewBest: false, record: stagedRecord() };
}

/**
 * The draft after Harbour Row: the run is staged one letter short of the quota, then the
 * autopilot delivers it for real, so the draft on screen is the one the world opened —
 * choices, bonus and all — exactly as a player's first draft appears.
 */
function stageDraft(seed) {
  const world = createWorld(createRandom(seed));
  world.startRun();
  const state = world.state;
  state.nightDelivered = state.quota - 1;
  state.letters = state.quota - 1;
  state.score = 640;
  playForward(world, autopilotControl, (w) => w.state.phase === 'draft', 40);
  // A breath of drift behind the cards, as the screen settles.
  playForward(world, () => ({ climb: false, dive: false }), null, 0.8);
  return { world, screen: 'draft', best: 0, isNewBest: false };
}

/**
 * An express dash in the Storm Quarter: the campaign is staged onto the seventh route
 * with two upgrades aboard and three letters already down, the first target forced to
 * an express, then flown until an express letter is on the clock with a rain band in
 * view and the combo warm — the frame the weather and the specials share.
 */
function stageStorm(seed) {
  const world = createWorld(createRandom(seed));
  world.startRun();
  const state = world.state;
  state.upgrades.push('tailwind', 'sturdy');
  world.jumpToRoute(6);
  state.nightDelivered = 3;
  state.letters = 37;
  state.score = 9100;
  state.bestCombo = 5;
  world.forceNextSpecial('express');
  const rainInView = (w) => w.weather.fronts.some(
    (front) => front.kind === 'rain' && front.x - w.state.cameraX < 980 && front.x + front.w - w.state.cameraX > 240,
  );
  // The scene must not end: hold the route's count below its quota, so the campaign
  // never advances out of the Storm Quarter while the frame is being found.
  const holdRoute = (w) => {
    if (w.state.nightDelivered >= 6) w.state.nightDelivered = 2;
  };
  const found = playForward(
    world,
    autopilotControl,
    (w) => {
      holdRoute(w);
      const special = w.state.special;
      return Boolean(
        special && special.kind === 'express' && special.t > 3.2 && special.t < 7.6
        && w.state.combo >= 2 && rainInView(w),
      );
    },
    70,
  );
  if (!found) {
    // Any express on the clock will do: the band is never far away in this district.
    playForward(
      world,
      autopilotControl,
      (w) => {
        holdRoute(w);
        return Boolean(w.state.special && w.state.special.kind === 'express' && w.state.special.t > 2.5);
      },
      30,
    );
  }
  return { world, screen: 'play', best: 0, isNewBest: false };
}

/**
 * The Storm Warden, mid-fight: the campaign is staged onto his route with three
 * upgrades aboard and four of his seven letters already down — so his lantern
 * swings at half its full fury — then flown until the lantern is visibly off its
 * home position with the plane in the air beneath the storm. The frame is the
 * boss's own: the crowned lantern, its chain, the rising dawn behind the roofs.
 */
function stageBoss(seed) {
  const world = createWorld(createRandom(seed));
  world.startRun();
  const state = world.state;
  state.upgrades.push('tailwind', 'sturdy', 'longcombo');
  world.jumpToRoute(11);
  state.banner = null; // the run's opening banner belongs to Harbour Row, not this fight
  state.nightDelivered = 4;
  state.letters = 76;
  state.score = 16400;
  state.routeScore = 2400;
  state.bestCombo = 6;
  const found = playForward(
    world,
    autopilotControl,
    (w) => Boolean(
      w.state.target && w.state.boss
      && Math.abs(w.state.target.y - w.state.boss.baseY) > 20
      && w.state.phase === 'playing',
    ),
    60,
  );
  if (!found) {
    // Any frame of the fight will do: the lantern and the storm carry it.
    playForward(world, autopilotControl, (w) => Boolean(w.state.target), 20);
  }
  return { world, screen: 'play', best: 0, isNewBest: false };
}

/**
 * The results of a won campaign: staged onto the Warden's route one letter short,
 * with three upgrades aboard and the eleven flown routes' results already in the
 * book (their medals computed by medals.js from their scores), and the last letter
 * delivered by the autopilot for real — the win on screen is the world's own. If a
 * seed's storm refuses, fall back to the wreck of a late route, which is also a
 * true ending.
 */
function stageOver(seed) {
  const world = createWorld(createRandom(seed));
  world.startRun();
  const state = world.state;
  state.upgrades.push('tailwind', 'sturdy', 'longcombo');
  const flownScores = [1250, 2150, 1900, 2900, 3100, 2400, 2900, 2600, 3400, 3300, 3600];
  flownScores.forEach((score, i) => {
    state.routeResults.push({ route: i, score, medal: medalForRoute(score, ROUTES[i], i) });
  });
  world.jumpToRoute(11);
  state.nightDelivered = state.quota - 1;
  state.letters = 79;
  state.score = 29800;
  // The six Warden letters already down in this fiction scored as letters do.
  state.routeScore = 2600;
  state.bestCombo = 7;
  const won = playForward(world, autopilotControl, (w, events) => (events & EV_OVER) !== 0, 44);
  if (!won || !state.won) {
    // The storm took this seed: show the other true ending, a crash late in the campaign.
    const late = createWorld(createRandom(seed));
    late.startRun();
    late.state.upgrades.push('tailwind');
    late.jumpToRoute(5);
    late.state.letters = 30;
    late.state.score = 9800;
    late.state.bestCombo = 5;
    playForward(late, autopilotControl, (w) => w.state.letters >= 33, 40);
    playForward(late, () => ({ climb: false, dive: true }), (w, events) => (events & EV_OVER) !== 0, 20);
    playForward(late, () => ({ climb: false, dive: false }), null, 1.6);
    const lateScore = late.state.score;
    return { world: late, screen: 'over', best: lateScore, isNewBest: lateScore > 0, record: stagedRecord() };
  }
  // Let the moment settle, as it does for a player reading the results.
  playForward(world, () => ({ climb: false, dive: false }), null, 1.6);
  const score = state.score;
  return { world, screen: 'over', best: score, isNewBest: score > 0, record: stagedRecord() };
}

/** Stage the named scene ('title' unless it is campaign, boss, storm, draft or over). */
export function stageShot(name, seed) {
  if (name === 'campaign') return stageCampaign(seed);
  if (name === 'draft') return stageDraft(seed);
  if (name === 'boss') return stageBoss(seed);
  if (name === 'storm' || name === 'play') return stageStorm(seed);
  if (name === 'over') return stageOver(seed);
  return stageTitle(seed);
}
