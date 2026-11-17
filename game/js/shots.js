// The screenshot scenes behind ?shot=title|draft|play|over (with &seed=N). Each scene builds
// a real world from the seed and plays it forward with the autopilot below — steer at the
// target window, stay clear of the rooftops — so the frame is what an actual game looks
// like, and the same seed always produces the same frame. Nothing here draws anything
// itself. The scenes stage the campaign arc: the title, the upgrade draft after the first
// route, a mid-combo delivery deep in the Mill District, and the results of a won campaign.

import {
  BASE_SPEED, DELIVERY_REACH, DIVE, GRAVITY, LIFT, MAX_FALL, MAX_RISE, PLANE_X, STEP,
} from './config.js';
import { ROUTES } from './campaign.js';
import { createRandom } from './random.js';
import { createWorld, EV_DELIVER, EV_OVER } from './world.js';

/** The flight forces of one step, mirroring world.js exactly (upgrades included), so the
 *  autopilot's replay below predicts the real flight and not last version's. */
function stepForces(state) {
  const route = ROUTES[state.route];
  const tailwind = state.upgrades.includes('tailwind');
  return {
    speed: BASE_SPEED + route.speed,
    lift: LIFT * (tailwind ? 1.2 : 1),
    gustPush: (240 + 60 * state.route) * route.wind * (tailwind ? 2 / 3 : 1),
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
    // Rain bands push where they stand; the fronts barely drift over a replay's
    // second, so the live system's answer at the replayed position is close enough.
    sim.plane.vy += world.weather.pushAt(sim.cameraX + PLANE_X) * STEP;
    sim.plane.vy = Math.max(MAX_RISE, Math.min(MAX_FALL, sim.plane.vy));
    sim.plane.y += sim.plane.vy * STEP;
    if (sim.plane.y < 30) {
      sim.plane.y = 30;
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

function stageTitle(seed) {
  const world = createWorld(createRandom(seed));
  playForward(world, () => ({ climb: false, dive: false }), null, 4.5);
  return { world, screen: 'title', best: 0, isNewBest: false };
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
 * A mid-combo delivery in the Mill District: the campaign is staged onto the third route
 * with the Tailwind Charm already drafted, then flown until just after a combo delivery.
 */
function stagePlay(seed) {
  const world = createWorld(createRandom(seed));
  world.startRun();
  const state = world.state;
  state.upgrades.push('tailwind');
  world.jumpToRoute(2);
  state.nightDelivered = 2;
  state.letters = 13;
  state.score = 2410;
  state.bestCombo = 3;
  let sinceDelivery = Infinity;
  playForward(
    world,
    autopilotControl,
    (w, events) => {
      if (events & EV_DELIVER) sinceDelivery = 0;
      else sinceDelivery += STEP;
      return w.state.combo >= 2 && sinceDelivery > 0.14 && sinceDelivery < 0.6;
    },
    45,
  );
  return { world, screen: 'play', best: 0, isNewBest: false };
}

/**
 * The results of a won campaign: staged onto the Dawn Run one letter short, with three
 * upgrades aboard, and the last letter delivered by the autopilot for real — the win on
 * screen is the world's own. If a seed's storm refuses, fall back to the wreck of a late
 * route, which is also a true ending.
 */
function stageOver(seed) {
  const world = createWorld(createRandom(seed));
  world.startRun();
  const state = world.state;
  state.upgrades.push('tailwind', 'sturdy', 'longcombo');
  world.jumpToRoute(5);
  state.nightDelivered = state.quota - 1;
  state.letters = 35;
  state.score = 8640;
  state.bestCombo = 6;
  const won = playForward(world, autopilotControl, (w, events) => (events & EV_OVER) !== 0, 44);
  if (!won || !state.won) {
    // The storm took this seed: show the other true ending, a crash late in the campaign.
    const late = createWorld(createRandom(seed));
    late.startRun();
    late.state.upgrades.push('tailwind');
    late.jumpToRoute(3);
    late.state.letters = 24;
    late.state.score = 5120;
    late.state.bestCombo = 5;
    playForward(late, autopilotControl, (w) => w.state.letters >= 27, 40);
    playForward(late, () => ({ climb: false, dive: true }), (w, events) => (events & EV_OVER) !== 0, 20);
    playForward(late, () => ({ climb: false, dive: false }), null, 1.6);
    const lateScore = late.state.score;
    return { world: late, screen: 'over', best: lateScore, isNewBest: lateScore > 0 };
  }
  // Let the moment settle, as it does for a player reading the results.
  playForward(world, () => ({ climb: false, dive: false }), null, 1.6);
  const score = state.score;
  return { world, screen: 'over', best: score, isNewBest: score > 0 };
}

/** Stage the named scene ('title' unless it is draft, play or over) and return what to draw. */
export function stageShot(name, seed) {
  if (name === 'draft') return stageDraft(seed);
  if (name === 'play') return stagePlay(seed);
  if (name === 'over') return stageOver(seed);
  return stageTitle(seed);
}
